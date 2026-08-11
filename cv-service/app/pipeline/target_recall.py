"""Phase 3E target recall: keep and re-acquire the SELECTED athlete.

Everything in this module is deliberately one-sided. Generic association and
generic detection filtering stay exactly as strict as Phase 3D made them — the
gates that get relaxed here apply only to the confirmed target, and only when
appearance evidence from the user-confirmed in-game crops supports it.

Diagnostics are first-class: every rescue and every rejection is counted so a
run can be read after the fact ("what filter was eating the target?").
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.pipeline.calibration import calibrator
from app.pipeline.reid import (
    ReferenceGallery,
    signatures_batch,
    similarity,
    uniform_affinity,
)


@dataclass
class TargetRecallStats:
    candidates_considered: int = 0
    rejected_by_size: int = 0
    rejected_by_court: int = 0
    rejected_by_aspect: int = 0
    rejected_by_appearance: int = 0
    rescued_size: int = 0
    rescued_court: int = 0
    rescued_aspect: int = 0
    reacquisitions: int = 0
    failed_reacquisitions: int = 0
    memory_frames: int = 0
    soft_confidence_penalties: int = 0
    # Phase 3G: rescue decisions broken down by the context that set the gate.
    context_decisions: dict[str, dict[str, int]] = field(default_factory=dict)
    appearance_scores: list[float] = field(default_factory=list)
    raw_appearance_scores: list[float] = field(default_factory=list)

    @property
    def rescued_total(self) -> int:
        return self.rescued_size + self.rescued_court + self.rescued_aspect

    def note_appearance(self, value: float, raw: float | None = None) -> None:
        if len(self.appearance_scores) < 20000:
            self.appearance_scores.append(round(float(value), 3))
        if raw is not None and len(self.raw_appearance_scores) < 20000:
            self.raw_appearance_scores.append(round(float(raw), 3))

    def note_context(self, context: str, accepted: bool) -> None:
        bucket = self.context_decisions.setdefault(context, {"accepted": 0, "rejected": 0})
        bucket["accepted" if accepted else "rejected"] += 1

    def payload(self) -> dict:
        scores = self.appearance_scores
        raw_scores = self.raw_appearance_scores
        return {
            "targetCandidatesConsidered": self.candidates_considered,
            "targetRejectedBySize": self.rejected_by_size,
            "targetRejectedByCourtFilter": self.rejected_by_court,
            "targetRejectedByAspect": self.rejected_by_aspect,
            "targetRejectedByAppearanceThreshold": self.rejected_by_appearance,
            "targetRescuedFromSizeFilter": self.rescued_size,
            "targetRescuedFromCourtFilter": self.rescued_court,
            "targetRescuedFromAspectFilter": self.rescued_aspect,
            "targetRescuedTotal": self.rescued_total,
            "targetSoftConfidencePenalties": self.soft_confidence_penalties,
            "targetSuccessfulReacquisitions": self.reacquisitions,
            "targetFailedReacquisitions": self.failed_reacquisitions,
            "targetMemoryFrames": self.memory_frames,
            "targetRescueDecisionsByContext": {
                key: dict(value) for key, value in sorted(self.context_decisions.items())
            },
            "targetRescueAppearanceMean": round(float(np.mean(scores)), 3) if scores else 0.0,
            "targetRescueAppearanceMeanRaw": round(float(np.mean(raw_scores)), 3)
            if raw_scores
            else 0.0,
        }


def _centre(box) -> tuple[float, float]:
    return ((box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0)


def recall_target_detections(
    frame: np.ndarray,
    rejected: list[tuple[object, str]],
    gallery: ReferenceGallery,
    target_signature: np.ndarray | None,
    last_target_box: tuple[float, float, float, float] | None,
    *,
    appearance_threshold: float,
    near_appearance_threshold: float,
    near_radius_px: float,
    min_height_fraction: float,
    max_per_frame: int,
    court_confidence_penalty: float,
    stats: TargetRecallStats,
    predicted_target_box: tuple[float, float, float, float] | None = None,
    far_radius_px: float | None = None,
    uniform_primary: np.ndarray | None = None,
    uniform_secondary: np.ndarray | None = None,
    motion_bonus: float = 0.0,
    uniform_bonus: float = 0.0,
    uniform_min: float = 0.62,
    context_bonus_max: float = 0.10,
    far_penalty: float = 0.0,
) -> list[object]:
    """Return detections that were filtered out but plausibly ARE the target.

    Phase 3G makes the gate context-aware. Candidates near the PREDICTED target
    position, candidates that continue the target's motion, and candidates whose
    torso colour matches the team uniform get a bounded discount; candidates far
    from any plausible target position must match more strongly than before.
    Nothing here touches generic (non-target) association or filtering.
    """
    if not rejected or not (gallery.has_confirmed or target_signature is not None):
        return []

    height = float(frame.shape[0])
    calib = calibrator()
    if calib.enabled:
        # Percentile-derived rescue gates replace the histogram-era constants.
        appearance_threshold = calib.threshold("rescue")
        near_appearance_threshold = calib.threshold("rescue_near")
    scored: list[tuple[float, float, object, str]] = []
    reference_box = predicted_target_box or last_target_box
    far_radius = far_radius_px if far_radius_px is not None else near_radius_px * 2.5

    # Phase 3F: one batched embedding pass for all candidates instead of one
    # forward pass per crop — the learned appearance model is the expensive part.
    viable: list[tuple[object, str]] = []
    for detection, reason in rejected:
        box = detection.box
        box_height_fraction = (box[3] - box[1]) / max(1.0, height)
        stats.candidates_considered += 1
        if reason == "size":
            stats.rejected_by_size += 1
        elif reason == "court":
            stats.rejected_by_court += 1
        else:
            stats.rejected_by_aspect += 1

        # Even a soft filter has a floor: sub-pixel blobs are never a player.
        if box_height_fraction < min_height_fraction:
            continue
        viable.append((detection, reason))

    candidate_signatures = signatures_batch(frame, [d.box for d, _ in viable])
    for (detection, reason), sig in zip(viable, candidate_signatures):
        box = detection.box
        if sig is None or not getattr(sig, "size", 0):
            continue
        raw_appearance = max(
            gallery.score_raw(sig),
            similarity(target_signature, sig) if target_signature is not None else 0.0,
        )
        appearance = calib.normalize(raw_appearance)
        stats.note_appearance(appearance, raw_appearance)

        distance = float("inf")
        if reference_box is not None:
            lx, ly = _centre(reference_box)
            cx, cy = _centre(box)
            distance = float(np.hypot(cx - lx, cy - ly))

        near = distance <= near_radius_px
        far = distance > far_radius
        needed = near_appearance_threshold if near else appearance_threshold
        context = "near_predicted" if near else "mid_range"

        discount = 0.0
        # Motion continuity: the candidate sits where the target was heading.
        if predicted_target_box is not None and distance <= far_radius:
            motion_agreement = max(0.0, 1.0 - distance / max(1e-6, far_radius))
            if motion_agreement >= 0.5:
                discount += motion_bonus * motion_agreement
                context = "motion_continuity" if not near else context
        # Team/uniform affinity as a secondary context signal.
        if uniform_primary is not None or uniform_secondary is not None:
            affinity = uniform_affinity(frame, box, uniform_primary, uniform_secondary)
            if affinity >= uniform_min:
                discount += uniform_bonus
                if context == "mid_range":
                    context = "uniform_affinity"
        needed = max(0.05, needed - min(context_bonus_max, discount))
        if far:
            # Distant candidates are the identity-swap risk: require MORE.
            needed += far_penalty
            context = "far"

        accepted = appearance >= needed
        calib.note_decision("rescue_near" if near else "rescue", accepted)
        stats.note_context(context, accepted)
        if not accepted:
            stats.rejected_by_appearance += 1
            gallery.note_rejected(raw_appearance)
            continue
        gallery.note_positive(raw_appearance)
        scored.append((appearance, distance, detection, reason))

    if not scored:
        return []

    # Nearest plausible candidates first, then the strongest appearance.
    scored.sort(key=lambda item: (item[1], -item[0]))
    rescued: list[object] = []
    for appearance, _distance, detection, reason in scored[: max(1, max_per_frame)]:
        if reason == "court":
            # Soft court filtering: keep it, but trust it a little less.
            detection.confidence = float(detection.confidence * court_confidence_penalty)
            stats.soft_confidence_penalties += 1
            stats.rescued_court += 1
        elif reason == "size":
            stats.rescued_size += 1
        else:
            stats.rescued_aspect += 1
        rescued.append(detection)
    return rescued
