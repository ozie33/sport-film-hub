"""Multi-object tracking with appearance-assisted association.

Track IDs are local to a single video analysis. A track_id is never a player_id.

Phase 3D tuning: association is time-aware (gaps between detection passes are
seconds, not frames), gated by basketball-plausible displacement, tolerant of
box jitter and short occlusions, and followed by a tracklet-stitching pass that
merges compatible fragments.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.pipeline.reid import similarity


def iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def centre(box: tuple[float, float, float, float]) -> tuple[float, float]:
    return ((box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0)


def box_height(box: tuple[float, float, float, float]) -> float:
    return max(1.0, box[3] - box[1])


@dataclass
class TrackPoint:
    timestamp: float
    box: tuple[float, float, float, float]
    detection_confidence: float
    interpolated: bool = False


@dataclass
class Track:
    track_id: str
    points: list[TrackPoint] = field(default_factory=list)
    signatures: list[np.ndarray] = field(default_factory=list)
    association_scores: list[float] = field(default_factory=list)
    last_timestamp: float = 0.0
    missed: int = 0
    merged_from: list[str] = field(default_factory=list)

    # ------------------------------------------------------------- real points

    @property
    def real_points(self) -> list[TrackPoint]:
        """Detection-backed points only. Interpolated boxes must never drive
        association or velocity, otherwise prediction error compounds."""
        return [point for point in self.points if not point.interpolated]

    @property
    def last_real(self) -> TrackPoint | None:
        for point in reversed(self.points):
            if not point.interpolated:
                return point
        return self.points[-1] if self.points else None

    @property
    def velocity(self) -> tuple[float, float]:
        """Constant-velocity estimate in pixels/second from recent points."""
        real = self.real_points[-3:]
        if len(real) < 2:
            return 0.0, 0.0
        first, last = real[0], real[-1]
        dt = last.timestamp - first.timestamp
        if dt <= 1e-6:
            return 0.0, 0.0
        fx = (last.box[0] + last.box[2]) / 2 - (first.box[0] + first.box[2]) / 2
        fy = (last.box[1] + last.box[3]) / 2 - (first.box[1] + first.box[3]) / 2
        return fx / dt, fy / dt

    def predict(self, timestamp: float) -> tuple[float, float, float, float] | None:
        """Where the box should be at `timestamp` with no new detection."""
        last = self.last_real
        if last is None:
            return None
        dt = timestamp - last.timestamp
        vx, vy = self.velocity
        dx, dy = vx * dt, vy * dt
        return (last.box[0] + dx, last.box[1] + dy, last.box[2] + dx, last.box[3] + dy)

    @property
    def start_time(self) -> float:
        return self.points[0].timestamp if self.points else 0.0

    @property
    def end_time(self) -> float:
        return self.points[-1].timestamp if self.points else 0.0

    @property
    def mean_signature(self) -> np.ndarray:
        if not self.signatures:
            return np.zeros(0, dtype=np.float32)
        return np.mean(np.stack(self.signatures[-12:]), axis=0)

    @property
    def duration(self) -> float:
        return max(0.0, self.end_time - self.start_time)

    def absorb(self, other: "Track") -> None:
        """Merge another tracklet into this one (stitching)."""
        self.points.extend(other.points)
        self.points.sort(key=lambda point: point.timestamp)
        self.signatures.extend(other.signatures)
        self.association_scores.extend(other.association_scores)
        self.merged_from.append(other.track_id)
        self.merged_from.extend(other.merged_from)
        self.last_timestamp = max(self.last_timestamp, other.last_timestamp)

    @property
    def detection_confidence(self) -> float:
        if not self.points:
            return 0.0
        return float(np.mean([p.detection_confidence for p in self.points]))

    @property
    def tracking_confidence(self) -> float:
        """Association quality plus continuity — real inference, not a constant."""
        if not self.association_scores:
            return 0.0
        association = float(np.mean(self.association_scores))
        span = max(1e-6, self.end_time - self.start_time)
        expected = span / max(1e-6, self.mean_gap)
        continuity = min(1.0, len(self.points) / max(1.0, expected))
        return float(max(0.0, min(1.0, 0.6 * association + 0.4 * continuity)))

    @property
    def mean_gap(self) -> float:
        if len(self.points) < 2:
            return 1.0
        gaps = [
            self.points[i + 1].timestamp - self.points[i].timestamp
            for i in range(len(self.points) - 1)
        ]
        return float(max(1e-6, np.median(gaps)))

    def box_history(self, limit: int = 400) -> list[dict[str, float]]:
        step = max(1, len(self.points) // limit)
        return [
            {
                "t": round(point.timestamp, 3),
                "x1": round(point.box[0], 1),
                "y1": round(point.box[1], 1),
                "x2": round(point.box[2], 1),
                "y2": round(point.box[3], 1),
                "c": round(point.detection_confidence, 3),
                "i": 1 if point.interpolated else 0,
            }
            for point in self.points[::step]
        ]


class MultiObjectTracker:
    """Time-aware association: IoU + centre proximity + appearance, gated by a
    basketball-plausible displacement so impossible jumps never associate and
    small box jitter never spawns a new identity."""

    def __init__(
        self,
        iou_threshold: float = 0.15,
        max_age_seconds: float = 3.0,
        max_speed_px_per_second: float = 420.0,
        appearance_threshold: float = 0.45,
        proximity_threshold: float = 0.30,
    ) -> None:
        self.tracks: list[Track] = []
        self.active: list[Track] = []
        self.iou_threshold = iou_threshold
        self.max_age_seconds = max_age_seconds
        self.max_speed = max_speed_px_per_second
        self.appearance_threshold = appearance_threshold
        self.proximity_threshold = proximity_threshold
        self._next = 1
        self.last_new_track_ids: set[str] = set()
        self.reappeared_track_ids: set[str] = set()
        self.rejected_impossible_jumps = 0

    def _new_track(self, timestamp: float, box, confidence: float, sig: np.ndarray) -> Track:
        track = Track(track_id=f"t{self._next}")
        self._next += 1
        track.points.append(TrackPoint(timestamp, box, confidence))
        if sig is not None and getattr(sig, "size", 0):
            track.signatures.append(sig)
        track.association_scores.append(0.5)
        track.last_timestamp = timestamp
        self.tracks.append(track)
        self.active.append(track)
        return track

    # -------------------------------------------------------------- association

    def _pair_score(self, track: Track, timestamp: float, box, sig) -> float | None:
        last = track.last_real
        if last is None:
            return None
        dt = timestamp - last.timestamp
        if dt < 0 or dt > self.max_age_seconds:
            return None

        predicted = track.predict(timestamp) or last.box
        geometric = max(iou(last.box, box), iou(predicted, box))

        scale = 0.5 * (box_height(last.box) + box_height(box))
        px, py = centre(predicted)
        cx, cy = centre(box)
        distance = float(np.hypot(cx - px, cy - py))

        # Basketball motion constraint: a player cannot teleport across the court.
        allowed = self.max_speed * max(0.35, dt) + 0.75 * scale
        if distance > allowed:
            self.rejected_impossible_jumps += 1
            return None

        proximity = max(0.0, 1.0 - distance / max(1e-6, 2.5 * scale))
        appearance = (
            similarity(track.mean_signature, sig) if sig is not None and getattr(sig, "size", 0) else 0.0
        )

        accept = (
            geometric >= self.iou_threshold
            or proximity >= self.proximity_threshold
            or appearance >= self.appearance_threshold + 0.15
        )
        if not accept:
            return None
        return float(0.40 * geometric + 0.32 * proximity + 0.28 * appearance)

    def update(
        self,
        timestamp: float,
        detections: list[tuple[tuple[float, float, float, float], float, np.ndarray]],
    ) -> list[tuple[Track, tuple[float, float, float, float]]]:
        result: list[tuple[Track, tuple[float, float, float, float]]] = []
        new_track_ids: set[str] = set()
        reappeared: set[str] = set()

        # Global greedy matching over every (detection, track) pair — better than
        # first-come-first-served, which was a major source of fragmentation.
        pairs: list[tuple[float, int, Track]] = []
        for index, (box, _confidence, sig) in enumerate(detections):
            for track in self.active:
                score = self._pair_score(track, timestamp, box, sig)
                if score is not None:
                    pairs.append((score, index, track))
        pairs.sort(key=lambda item: item[0], reverse=True)

        matched_detections: dict[int, tuple[Track, float]] = {}
        used_tracks: set[str] = set()
        for score, index, track in pairs:
            if index in matched_detections or track.track_id in used_tracks:
                continue
            matched_detections[index] = (track, score)
            used_tracks.add(track.track_id)

        for index, (box, confidence, sig) in enumerate(detections):
            match = matched_detections.get(index)
            if match is None:
                track = self._new_track(timestamp, box, confidence, sig)
                result.append((track, box))
                new_track_ids.add(track.track_id)
                continue
            track, score = match
            gap = timestamp - (track.last_real.timestamp if track.last_real else timestamp)
            # Drop stale interpolated tail so it cannot pollute the real history.
            while track.points and track.points[-1].interpolated:
                track.points.pop()
            track.points.append(TrackPoint(timestamp, box, confidence))
            if sig is not None and getattr(sig, "size", 0):
                track.signatures.append(sig)
            track.association_scores.append(score)
            track.last_timestamp = timestamp
            if gap > 1.5:
                reappeared.add(track.track_id)
            track.missed = 0
            result.append((track, box))

        # Occlusion memory is time based, not frame based.
        for track in list(self.active):
            last = track.last_real
            if last is None or timestamp - last.timestamp > self.max_age_seconds:
                self.active.remove(track)
        self.last_new_track_ids = new_track_ids
        self.reappeared_track_ids = reappeared
        return result

    def propagate(
        self, timestamp: float
    ) -> list[tuple[Track, tuple[float, float, float, float]]]:
        """Cheap motion-only step for frames between detection passes.

        No detector and no appearance work: each active track is advanced with
        its constant-velocity estimate so clip boundaries stay smooth at the
        original video timestamps.
        """
        result: list[tuple[Track, tuple[float, float, float, float]]] = []
        for track in self.active:
            predicted = track.predict(timestamp)
            if predicted is None:
                continue
            confidence = track.points[-1].detection_confidence * 0.9
            track.points.append(
                TrackPoint(timestamp, predicted, confidence, interpolated=True)
            )
            track.last_timestamp = timestamp
            result.append((track, predicted))
        return result


def stitch_tracks(
    tracks: list[Track],
    max_gap_seconds: float,
    max_speed_px_per_second: float,
    appearance_threshold: float,
) -> tuple[list[Track], int]:
    """Second pass: merge tracklets that are the same person across short gaps.

    Uses temporal proximity, spatial continuity (constant-velocity prediction)
    and appearance similarity together — all three must agree.
    """
    ordered = sorted([t for t in tracks if t.points], key=lambda t: t.start_time)
    survivors: list[Track] = []
    merges = 0

    for track in ordered:
        best: Track | None = None
        best_score = 0.0
        for candidate in survivors:
            gap = track.start_time - candidate.end_time
            if gap < -0.5 or gap > max_gap_seconds:
                continue
            predicted = candidate.predict(track.start_time)
            if predicted is None:
                continue
            head = track.points[0].box
            scale = 0.5 * (box_height(predicted) + box_height(head))
            px, py = centre(predicted)
            cx, cy = centre(head)
            distance = float(np.hypot(cx - px, cy - py))
            if distance > max_speed_px_per_second * max(0.35, gap) + 1.5 * scale:
                continue
            appearance = similarity(candidate.mean_signature, track.mean_signature)
            if appearance < appearance_threshold:
                continue
            proximity = max(0.0, 1.0 - distance / max(1e-6, 4.0 * scale))
            score = 0.55 * appearance + 0.45 * proximity
            if score > best_score:
                best_score, best = score, candidate

        if best is not None:
            best.absorb(track)
            merges += 1
        else:
            survivors.append(track)

    return survivors, merges
