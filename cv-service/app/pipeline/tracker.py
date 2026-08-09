"""Multi-object tracking with appearance-assisted association.

Track IDs are local to a single video analysis. A track_id is never a player_id.
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

    @property
    def velocity(self) -> tuple[float, float]:
        """Constant-velocity estimate in pixels/second from recent points."""
        if len(self.points) < 2:
            return 0.0, 0.0
        first, last = self.points[-3] if len(self.points) >= 3 else self.points[-2], self.points[-1]
        dt = last.timestamp - first.timestamp
        if dt <= 1e-6:
            return 0.0, 0.0
        fx = (last.box[0] + last.box[2]) / 2 - (first.box[0] + first.box[2]) / 2
        fy = (last.box[1] + last.box[3]) / 2 - (first.box[1] + first.box[3]) / 2
        return fx / dt, fy / dt

    def predict(self, timestamp: float) -> tuple[float, float, float, float] | None:
        """Where the box should be at `timestamp` with no new detection."""
        if not self.points:
            return None
        last = self.points[-1]
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
    """Greedy IoU + appearance association with short-term occlusion memory."""

    def __init__(self, max_missed: int = 6, iou_threshold: float = 0.25) -> None:
        self.tracks: list[Track] = []
        self.active: list[Track] = []
        self.max_missed = max_missed
        self.iou_threshold = iou_threshold
        self._next = 1

    def _new_track(self, timestamp: float, box, confidence: float, sig: np.ndarray) -> Track:
        track = Track(track_id=f"t{self._next}")
        self._next += 1
        track.points.append(TrackPoint(timestamp, box, confidence))
        track.signatures.append(sig)
        track.association_scores.append(0.5)
        track.last_timestamp = timestamp
        self.tracks.append(track)
        self.active.append(track)
        return track

    def update(
        self,
        timestamp: float,
        detections: list[tuple[tuple[float, float, float, float], float, np.ndarray]],
    ) -> list[tuple[Track, tuple[float, float, float, float]]]:
        assigned: set[str] = set()
        result: list[tuple[Track, tuple[float, float, float, float]]] = []

        for box, confidence, sig in detections:
            best_track: Track | None = None
            best_score = 0.0
            for track in self.active:
                if track.track_id in assigned or not track.points:
                    continue
                geometric = iou(track.points[-1].box, box)
                appearance = similarity(track.mean_signature, sig)
                score = 0.6 * geometric + 0.4 * appearance
                # Occluded tracks may re-associate on appearance alone.
                if geometric < self.iou_threshold and appearance < 0.6:
                    continue
                if score > best_score:
                    best_score, best_track = score, track

            if best_track is None:
                track = self._new_track(timestamp, box, confidence, sig)
                result.append((track, box))
                assigned.add(track.track_id)
                continue

            best_track.points.append(TrackPoint(timestamp, box, confidence))
            best_track.signatures.append(sig)
            best_track.association_scores.append(best_score)
            best_track.last_timestamp = timestamp
            best_track.missed = 0
            assigned.add(best_track.track_id)
            result.append((best_track, box))

        for track in list(self.active):
            if track.track_id not in assigned:
                track.missed += 1
                if track.missed > self.max_missed:
                    self.active.remove(track)
        return result
