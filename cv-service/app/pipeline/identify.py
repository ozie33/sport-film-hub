"""Target-player identification and re-identification decisions.

Signal priority (highest first):
  1. user-confirmed crops from THIS game
  2. appearance similarity to the current target track
  3. temporal continuity
  4. team/uniform colour affinity
  5. jersey number when legible
  6. prior reference media

No face recognition. Jersey OCR is a bonus signal, never the sole basis.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.config import settings
from app.pipeline.reid import ReferenceGallery, similarity, uniform_affinity
from app.pipeline.tracker import Track, iou


@dataclass
class IdentityState:
    target_track_id: str | None = None
    target_signature: np.ndarray | None = None
    switches: int = 0
    per_track_scores: dict[str, list[float]] = field(default_factory=dict)
    needs_confirmation: list[dict] = field(default_factory=list)
    low_confidence_intervals: int = 0
    _low_open: bool = False
    _low_since: float | None = None
    _challenger_id: str | None = None
    _challenger_streak: int = 0
    locked: bool = False
    lock_time: float = 0.0
    cached_scores: dict[str, float] = field(default_factory=dict)
    reid_evaluations: int = 0
    reid_reasons: dict[str, int] = field(default_factory=dict)

    def remap(self, alias_to_canonical: dict[str, str]) -> None:
        """After tracklet stitching, fold scores onto the surviving track ids."""
        merged: dict[str, list[float]] = {}
        for track_id, scores in self.per_track_scores.items():
            merged.setdefault(alias_to_canonical.get(track_id, track_id), []).extend(scores)
        self.per_track_scores = merged
        if self.target_track_id:
            self.target_track_id = alias_to_canonical.get(
                self.target_track_id, self.target_track_id
            )

    def note_reid(self, reason: str) -> None:
        self.reid_evaluations += 1
        self.reid_reasons[reason] = self.reid_reasons.get(reason, 0) + 1

    def record(self, track_id: str, score: float) -> None:
        self.per_track_scores.setdefault(track_id, []).append(score)

    def identity_confidence(self, track_id: str) -> float:
        scores = self.per_track_scores.get(track_id) or []
        return float(np.mean(scores)) if scores else 0.0


def seed_gallery_from_confirmations(
    gallery: ReferenceGallery,
    signatures: list[np.ndarray],
) -> None:
    for vector in signatures:
        gallery.add(vector, "high")


def normalized_box_to_pixels(box: dict, width: int, height: int) -> tuple[float, float, float, float] | None:
    """Confirmation boxes are stored normalized (0..1) by the review UI."""
    try:
        x = float(box.get("x", box.get("left")))
        y = float(box.get("y", box.get("top")))
        w = float(box.get("w", box.get("width")))
        h = float(box.get("h", box.get("height")))
    except (TypeError, ValueError):
        return None
    if max(x, y, w, h) <= 1.5:
        x, y, w, h = x * width, y * height, w * width, h * height
    return (x, y, x + w, y + h)


def score_track(
    frame,
    track: Track,
    box: tuple[float, float, float, float],
    signature: np.ndarray,
    gallery: ReferenceGallery,
    state: IdentityState,
    uniform_primary,
    uniform_secondary,
    jersey_hint: float,
) -> float:
    """Combined identity score for one candidate track at one timestamp."""
    reference_score = gallery.score(signature)
    continuity = (
        similarity(state.target_signature, signature) if state.target_signature is not None else 0.0
    )
    same_track = 1.0 if track.track_id == state.target_track_id else 0.0
    colour = uniform_affinity(frame, box, uniform_primary, uniform_secondary)

    # Confirmed game-frame crops are the dominant signal when present; team
    # colours and jersey evidence are confidence boosters only.
    weights = (
        {
            "reference": 0.44,
            "continuity": 0.24,
            "same_track": 0.18,
            "colour": 0.09,
            "jersey": 0.05,
        }
        if gallery.has_confirmed
        else {
            "reference": 0.24,
            "continuity": 0.24,
            "same_track": 0.20,
            "colour": 0.13,
            "jersey": 0.07,
        }
    )
    score = (
        weights["reference"] * reference_score
        + weights["continuity"] * continuity
        + weights["same_track"] * same_track
        + weights["colour"] * colour
        + weights["jersey"] * jersey_hint
    )
    return float(max(0.0, min(1.0, score)))


def choose_target(
    frame,
    observations: list[tuple[Track, tuple[float, float, float, float], np.ndarray]],
    gallery: ReferenceGallery,
    state: IdentityState,
    uniform_primary,
    uniform_secondary,
    timestamp: float,
    confirmation_threshold: float,
    reid_track_ids: set[str] | None = None,
) -> tuple[Track, float] | None:
    """Pick the track most likely to be the selected athlete.

    When confidence is weak the current target is retained rather than jumping
    to another player, and a confirmation request is emitted instead.
    """
    if not observations:
        return None

    target_id = state.target_track_id
    locked_target = next(
        (item for item in observations if item[0].track_id == target_id), None
    )

    # Target lock: while the selected athlete is still tracked and plausible, do
    # not rescore every player on the floor.
    if state.locked and locked_target is not None:
        track, box, signature = locked_target
        if signature is not None and getattr(signature, "size", 0):
            score = score_track(
                frame, track, box, signature, gallery, state, uniform_primary, uniform_secondary, 0.5
            )
            state.cached_scores[track.track_id] = score
        else:
            score = state.cached_scores.get(track.track_id, 0.0)
        if score >= settings.target_lock_threshold:
            state.record(track.track_id, score)
            state._low_open = False
            state._low_since = None
            state._challenger_streak = 0
            if signature is not None and getattr(signature, "size", 0):
                state.target_signature = track.mean_signature
            return track, score

    scored: list[tuple[Track, float, tuple[float, float, float, float]]] = []
    for track, box, signature in observations:
        # Full re-identification is expensive; it runs only for the tracks the
        # caller flagged (new, ambiguous, reappeared, or low-confidence).
        full = reid_track_ids is None or track.track_id in reid_track_ids
        if full and signature is not None and signature.size:
            score = score_track(
                frame, track, box, signature, gallery, state, uniform_primary, uniform_secondary, 0.5
            )
            state.cached_scores[track.track_id] = score
        else:
            score = state.cached_scores.get(track.track_id, 0.0)
        state.record(track.track_id, score)
        scored.append((track, score, box))

    scored.sort(key=lambda item: item[1], reverse=True)
    best_track, best_score, _ = scored[0]

    if best_score < confirmation_threshold:
        # Do not switch players on weak evidence. Only ask the user when the
        # ambiguity persists — brief dips are normal in wide-angle film.
        if state._low_since is None:
            state._low_since = timestamp
        sustained = timestamp - state._low_since >= settings.confirmation_min_seconds
        if sustained and not state._low_open:
            state.low_confidence_intervals += 1
            state._low_open = True
            state.locked = False
            if len(state.needs_confirmation) < settings.confirmation_max_requests:
                state.needs_confirmation.append(
                {
                    "timestamp": round(timestamp, 2),
                    "reason": "identity_confidence_low",
                    "candidates": [
                        {
                            "trackId": track.track_id,
                            "boundingBox": {
                                "x1": round(box[0], 1),
                                "y1": round(box[1], 1),
                                "x2": round(box[2], 1),
                                "y2": round(box[3], 1),
                            },
                            "identityConfidence": round(score, 3),
                        }
                        for track, score, box in scored[:4]
                    ],
                }
                )
        current = next(
            (item for item in scored if item[0].track_id == state.target_track_id), None
        )
        if current is not None:
            return current[0], current[1]
        return None

    state._low_open = False
    state._low_since = None
    if state.target_track_id and best_track.track_id != state.target_track_id:
        # Only accept a switch when a single challenger is clearly and
        # repeatedly better than staying put.
        current = next(
            (item for item in scored if item[0].track_id == state.target_track_id), None
        )
        margin = best_score - (current[1] if current is not None else 0.0)
        if current is not None and margin < settings.target_switch_margin:
            state._challenger_streak = 0
            return current[0], current[1]
        if state._challenger_id == best_track.track_id:
            state._challenger_streak += 1
        else:
            state._challenger_id = best_track.track_id
            state._challenger_streak = 1
        if current is not None and state._challenger_streak < settings.target_switch_frames:
            return current[0], current[1]
        state.switches += 1
        state._challenger_streak = 0

    state.target_track_id = best_track.track_id
    state.target_signature = best_track.mean_signature
    if best_score >= max(settings.target_lock_threshold, confirmation_threshold):
        if not state.locked:
            state.lock_time = timestamp
        state.locked = True
    return best_track, best_score


def match_confirmation(
    observations: list[tuple[Track, tuple[float, float, float, float], np.ndarray]],
    target_box: tuple[float, float, float, float],
) -> tuple[Track, np.ndarray] | None:
    best = None
    best_iou = 0.0
    for track, box, signature in observations:
        overlap = iou(box, target_box)
        if overlap > best_iou:
            best_iou, best = overlap, (track, signature)
    return best if best_iou >= 0.15 else None
