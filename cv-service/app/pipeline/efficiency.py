"""Phase 3G — re-identification efficiency: shortlist, cache, diagnostics.

The learned embedding is the expensive part of the pipeline (337s of a 552s
run on the 0.5.2 baseline). Nothing here changes WHAT is matched, only how
often the model has to run:

  * stage 1 shortlists detections with cheap signals only (spatial proximity to
    the predicted target/track positions, motion continuity, uniform affinity)
  * stage 2 embeds the top-K shortlisted crops
  * embeddings are cached per spatial slot and reused for the same track until
    the box moves materially, another detection occludes it, or the track's
    confidence drops

Every avoided embedding, every cache hit and every invalidation reason is
counted, so a run can be audited after the fact.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

Box = tuple[float, float, float, float]


def _iou(a: Box, b: Box) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _centre(box: Box) -> tuple[float, float]:
    return ((box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0)


@dataclass
class ReidEfficiencyStats:
    detections_seen: int = 0
    shortlisted: int = 0
    shortlist_skipped: int = 0
    shortlist_passes: int = 0
    full_passes: int = 0
    embeddings_computed: int = 0
    embeddings_avoided_cache: int = 0
    cache_invalidated_stale: int = 0
    cache_invalidated_appearance: int = 0
    cache_invalidated_occlusion: int = 0
    cache_invalidated_confidence: int = 0

    def payload(self) -> dict:
        attempted = self.embeddings_computed + self.embeddings_avoided_cache
        return {
            "reidDetectionsSeen": self.detections_seen,
            "reidCandidatesShortlisted": self.shortlisted,
            "reidCandidatesSkippedByShortlist": self.shortlist_skipped,
            "reidShortlistPasses": self.shortlist_passes,
            "reidFullPasses": self.full_passes,
            "embeddingsComputed": self.embeddings_computed,
            "embeddingsAvoidedByCache": self.embeddings_avoided_cache,
            "embeddingCacheHitRate": round(
                self.embeddings_avoided_cache / attempted, 3
            )
            if attempted
            else 0.0,
            "embeddingCacheInvalidations": {
                "stale": self.cache_invalidated_stale,
                "appearanceDrift": self.cache_invalidated_appearance,
                "occlusion": self.cache_invalidated_occlusion,
                "lowConfidence": self.cache_invalidated_confidence,
            },
        }


@dataclass
class _CacheEntry:
    box: Box
    timestamp: float
    vector: np.ndarray
    track_id: str | None


@dataclass
class EmbeddingCache:
    """Short-lived per-slot appearance cache.

    A cached vector is reused only when the new box overlaps the cached box
    strongly (no material appearance change), the entry is fresh, nothing else
    overlaps the same slot (no occlusion) and the owning track still has usable
    confidence.
    """

    ttl_seconds: float = 1.6
    min_iou: float = 0.62
    max_entries: int = 64
    stats: ReidEfficiencyStats = field(default_factory=ReidEfficiencyStats)
    entries: list[_CacheEntry] = field(default_factory=list)

    def prune(self, timestamp: float) -> None:
        keep: list[_CacheEntry] = []
        for entry in self.entries:
            if timestamp - entry.timestamp <= self.ttl_seconds:
                keep.append(entry)
            else:
                self.stats.cache_invalidated_stale += 1
        self.entries = keep[-self.max_entries :]

    def lookup(
        self,
        box: Box,
        timestamp: float,
        *,
        others: list[Box],
        confidence: float = 1.0,
        strict: bool = False,
    ) -> np.ndarray | None:
        if self.ttl_seconds <= 0:
            return None
        ttl = self.ttl_seconds * (0.5 if strict else 1.0)
        best: _CacheEntry | None = None
        best_iou = 0.0
        for entry in self.entries:
            if timestamp - entry.timestamp > ttl or timestamp < entry.timestamp:
                continue
            overlap = _iou(entry.box, box)
            if overlap > best_iou:
                best_iou, best = overlap, entry
        if best is None:
            return None
        if best_iou < self.min_iou:
            # The crop content has materially changed — re-embed.
            self.stats.cache_invalidated_appearance += 1
            return None
        if confidence < 0.15:
            self.stats.cache_invalidated_confidence += 1
            return None
        for other in others:
            if other is box:
                continue
            if _iou(other, box) >= 0.35:
                # Another person overlaps this slot: appearance is contaminated.
                self.stats.cache_invalidated_occlusion += 1
                return None
        self.stats.embeddings_avoided_cache += 1
        return best.vector

    def store(self, box: Box, timestamp: float, vector: np.ndarray | None, track_id: str | None = None) -> None:
        if vector is None or not getattr(vector, "size", 0):
            return
        self.entries.append(_CacheEntry(box=box, timestamp=timestamp, vector=vector, track_id=track_id))
        if len(self.entries) > self.max_entries:
            self.entries = self.entries[-self.max_entries :]


def shortlist_score(
    box: Box,
    *,
    predicted_target: Box | None,
    track_predictions: list[Box],
    uniform: float,
) -> float:
    """Cheap plausibility score — no neural network involved.

    Combines closeness to the predicted target position, motion continuity with
    any active track, and team/uniform colour affinity.
    """
    scale = max(1.0, box[3] - box[1])
    target_proximity = 0.0
    if predicted_target is not None:
        px, py = _centre(predicted_target)
        cx, cy = _centre(box)
        distance = float(np.hypot(cx - px, cy - py))
        target_proximity = max(0.0, 1.0 - distance / max(1e-6, 8.0 * scale))
    continuity = 0.0
    for predicted in track_predictions:
        continuity = max(continuity, _iou(predicted, box))
    return float(0.5 * target_proximity + 0.3 * continuity + 0.2 * max(0.0, min(1.0, uniform)))


__all__ = ["EmbeddingCache", "ReidEfficiencyStats", "shortlist_score"]
