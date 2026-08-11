"""Appearance representation and re-identification (Phase 3F).

The primary signal is now a learned convolutional embedding (see
`app.pipeline.embedder`); colour histograms of the torso and legs remain as a
secondary signal, and team uniform colour is a third, weaker one. Deliberately
no face recognition and no dependence on jersey OCR — neither survives
wide-angle low-resolution game film.

A signature is a single concatenated unit vector whose blocks are individually
L2-normalised and pre-weighted, so plain cosine similarity of two signatures
equals `embed_weight * cos(embed) + (1 - embed_weight) * cos(hist)`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from app.config import settings
from app.pipeline.embedder import embedder
from app.pipeline.quality import CropQuality, crop_quality

BINS = (8, 8, 8)
HIST_DIM = BINS[0] * BINS[1] * BINS[2] * 2

# Trust tiers. Confirmed in-game crops describe what the athlete looks like in
# THIS game, on THIS film, in THIS uniform — they must always outrank generic
# reference photos from the player's library.
TRUST_WEIGHTS: dict[str, float] = {
    "high": 1.0,  # user-confirmed crop from the analysed game
    "auto": 0.82,  # high-quality crop auto-collected while locked on the target
    "medium": 0.55,  # player reference library photo
    "low": 0.34,  # weak/unknown provenance reference
}


def _unit(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    if norm == 0.0:
        return vector.astype(np.float32)
    return (vector / norm).astype(np.float32)


def _hist(patch: np.ndarray) -> np.ndarray:
    if patch.size == 0:
        return np.zeros(BINS[0] * BINS[1] * BINS[2], dtype=np.float32)
    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, list(BINS), [0, 180, 0, 256, 0, 256])
    hist = cv2.normalize(hist, hist).flatten().astype(np.float32)
    return hist


def crop(frame: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    height, width = frame.shape[:2]
    x1 = max(0, int(box[0]))
    y1 = max(0, int(box[1]))
    x2 = min(width, int(box[2]))
    y2 = min(height, int(box[3]))
    if x2 <= x1 or y2 <= y1:
        return np.zeros((0, 0, 3), dtype=np.uint8)
    return frame[y1:y2, x1:x2]


def colour_signature(patch: np.ndarray) -> np.ndarray:
    """Torso/leg colour histogram block (the secondary signal)."""
    if patch.size == 0:
        return np.zeros(HIST_DIM, dtype=np.float32)
    height = patch.shape[0]
    torso = patch[int(height * 0.15) : int(height * 0.55)]
    legs = patch[int(height * 0.55) : int(height * 0.95)]
    return _unit(np.concatenate([_hist(torso), _hist(legs)]))


def _combine(colour: np.ndarray, embedding: np.ndarray | None) -> np.ndarray:
    """Weighted concatenation so cosine == weighted sum of block cosines."""
    if embedding is None or embedding.size == 0:
        # Histogram-only fallback keeps the service functional if the embedding
        # model cannot be loaded.
        return np.concatenate([_unit(colour), np.zeros(0, dtype=np.float32)])
    weight = float(min(0.95, max(0.0, settings.embed_weight)))
    return np.concatenate(
        [
            np.sqrt(1.0 - weight) * _unit(colour),
            np.sqrt(weight) * _unit(embedding.astype(np.float32)),
        ]
    ).astype(np.float32)


def signatures_batch(
    frame: np.ndarray, boxes: list[tuple[float, float, float, float]]
) -> list[np.ndarray]:
    """Appearance vectors for many boxes with ONE batched embedding pass."""
    if not boxes:
        return []
    patches = [crop(frame, box) for box in boxes]
    embeddings = embedder().embed_crops(patches)
    return [
        _combine(colour_signature(patch), embedding)
        for patch, embedding in zip(patches, embeddings)
    ]


def signature(frame: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    """Appearance vector for one detection (learned embedding + colour)."""
    return signatures_batch(frame, [box])[0]


def similarity(a: np.ndarray | None, b: np.ndarray | None) -> float:
    if a is None or b is None or a.size == 0 or b.size == 0 or a.size != b.size:
        return 0.0
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(max(0.0, min(1.0, float(np.dot(a, b)) / denom)))


def hex_to_bgr(value: str | None) -> np.ndarray | None:
    if not value:
        return None
    raw = value.strip().lstrip("#")
    if len(raw) != 6:
        return None
    try:
        r, g, b = (int(raw[i : i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return None
    return np.array([b, g, r], dtype=np.float32)


def bgr_to_hex(colour: np.ndarray | None) -> str | None:
    if colour is None or colour.size < 3:
        return None
    b, g, r = (int(max(0, min(255, round(float(c))))) for c in colour[:3])
    return f"#{r:02x}{g:02x}{b:02x}"


def region_means(
    frame: np.ndarray, box: tuple[float, float, float, float]
) -> tuple[np.ndarray | None, np.ndarray | None]:
    """Mean torso and leg BGR colour for one crop — the game-specific look."""
    patch = crop(frame, box)
    if patch.size == 0:
        return None, None
    height = patch.shape[0]
    torso = patch[int(height * 0.15) : int(height * 0.55)]
    legs = patch[int(height * 0.55) : int(height * 0.95)]
    torso_mean = torso.reshape(-1, 3).mean(axis=0) if torso.size else None
    legs_mean = legs.reshape(-1, 3).mean(axis=0) if legs.size else None
    return torso_mean, legs_mean


def uniform_affinity(
    frame: np.ndarray,
    box: tuple[float, float, float, float],
    primary: np.ndarray | None,
    secondary: np.ndarray | None,
) -> float:
    """How close the torso colour is to the team's uniform colours (0..1)."""
    if primary is None and secondary is None:
        return 0.5
    patch = crop(frame, box)
    if patch.size == 0:
        return 0.0
    height = patch.shape[0]
    torso = patch[int(height * 0.15) : int(height * 0.55)]
    if torso.size == 0:
        return 0.0
    mean = torso.reshape(-1, 3).mean(axis=0)
    best = 0.0
    for colour in (primary, secondary):
        if colour is None:
            continue
        distance = float(np.linalg.norm(mean - colour))
        best = max(best, max(0.0, 1.0 - distance / 441.67))
    return best


def _drop(entries: list, target) -> None:
    """Remove by identity. `list.remove` would use `==`, and these entries hold
    numpy vectors, so dataclass equality raises "truth value of an array ...
    is ambiguous" once the bank fills up mid-film."""
    for index, item in enumerate(entries):
        if item is target:
            del entries[index]
            return


@dataclass(eq=False)
class ReferenceEntry:
    vector: np.ndarray
    trust: str
    weight: float
    quality: float
    pose: str
    timestamp: float | None = None


@dataclass
class ReferenceBank:
    """Multi-view reference bank: front/back/side, lighting and occlusion.

    Same-game confirmed crops carry the highest weight; automatically collected
    high-quality target crops come next; the player's generic reference library
    is a fallback signal only.
    """

    entries: list[ReferenceEntry] = field(default_factory=list)
    # Library crops embedded lazily: the embedding model subtracts a running
    # mean of the film's own detections, so references must be embedded AFTER
    # that mean is warm or their vectors live in a different space.
    pending: list[tuple[np.ndarray, str, float, str]] = field(default_factory=list)
    added: dict[str, int] = field(default_factory=dict)
    rejected_low_quality: int = 0
    evicted: int = 0
    positive_scores: list[float] = field(default_factory=list)
    rejected_scores: list[float] = field(default_factory=list)

    # ------------------------------------------------------------- mutation
    def add(
        self,
        vector: np.ndarray | None,
        trust: str,
        *,
        quality: float | CropQuality | None = None,
        pose: str = "unknown",
        timestamp: float | None = None,
        min_quality: float | None = None,
    ) -> bool:
        if vector is None or vector.size == 0:
            return False
        if isinstance(quality, CropQuality):
            pose = pose if pose != "unknown" else quality.pose
            quality_score = quality.score
        else:
            quality_score = 1.0 if quality is None else float(quality)
        floor = settings.reference_min_quality if min_quality is None else min_quality
        if trust in ("auto", "low") and quality_score < floor:
            self.rejected_low_quality += 1
            return False
        weight = TRUST_WEIGHTS.get(trust, 0.3)
        entry = ReferenceEntry(
            vector=_unit(vector),
            trust=trust,
            weight=weight,
            quality=round(float(quality_score), 3),
            pose=pose,
            timestamp=timestamp,
        )
        self.entries.append(entry)
        self.added[trust] = self.added.get(trust, 0) + 1
        self._prune(trust, pose)
        return True

    def add_image(
        self,
        patch: np.ndarray,
        trust: str,
        *,
        quality: float | CropQuality | None = None,
        pose: str = "unknown",
    ) -> bool:
        """Queue a reference crop; it is embedded on first use."""
        if patch is None or patch.size == 0:
            return False
        if isinstance(quality, CropQuality):
            pose = pose if pose != "unknown" else quality.pose
            quality_score = quality.score
        else:
            quality_score = 1.0 if quality is None else float(quality)
        self.pending.append((patch, trust, quality_score, pose))
        return True

    def flush_pending(self) -> int:
        if not self.pending:
            return 0
        queued, self.pending = self.pending, []
        patches = [item[0] for item in queued]
        embeddings = embedder().embed_crops(patches)
        added = 0
        for (patch, trust, quality_score, pose), embedding in zip(queued, embeddings):
            vector = _combine(colour_signature(patch), embedding)
            if self.add(vector, trust, quality=quality_score, pose=pose):
                added += 1
        return added

    def _prune(self, trust: str, pose: str) -> None:
        """Cap per-pose and per-trust size, dropping the weakest crops first."""
        per_pose = max(1, settings.reference_max_per_pose)
        same_pose = [e for e in self.entries if e.trust == trust and e.pose == pose]
        if len(same_pose) > per_pose:
            worst = min(same_pose, key=lambda e: e.quality)
            _drop(self.entries, worst)
            self.evicted += 1
        cap = settings.reference_max_confirmed if trust in ("high", "auto") else settings.reference_max_library
        tier = [e for e in self.entries if e.trust == trust]
        while len(tier) > max(1, cap):
            worst = min(tier, key=lambda e: e.quality)
            _drop(self.entries, worst)
            _drop(tier, worst)
            self.evicted += 1

    # -------------------------------------------------------------- scoring
    def score(self, vector: np.ndarray | None, *, top_k: int | None = None) -> float:
        """Trust-weighted top-k match. AI-generated crops never dominate."""
        self.flush_pending()
        if vector is None or vector.size == 0 or not self.entries:
            return 0.0
        k = max(1, top_k or settings.reference_top_k)
        scored = sorted(
            (entry.weight * similarity(vector, entry.vector) for entry in self.entries),
            reverse=True,
        )[:k]
        if not scored:
            return 0.0
        best = scored[0]
        if len(scored) == 1:
            return float(best)
        # Best view dominates, but agreement across views adds confidence and
        # suppresses one lucky match against a noisy crop.
        rest = float(np.mean(scored[1:]))
        return float(max(0.0, min(1.0, 0.7 * best + 0.3 * rest)))

    def best_by_trust(self, vector: np.ndarray | None) -> dict[str, float]:
        out: dict[str, float] = {}
        if vector is None or vector.size == 0:
            return out
        for entry in self.entries:
            value = similarity(vector, entry.vector)
            if value > out.get(entry.trust, 0.0):
                out[entry.trust] = round(value, 3)
        return out

    def note_positive(self, value: float) -> None:
        if len(self.positive_scores) < 40000:
            self.positive_scores.append(round(float(value), 3))

    def note_rejected(self, value: float) -> None:
        if len(self.rejected_scores) < 40000:
            self.rejected_scores.append(round(float(value), 3))

    # ------------------------------------------------------------ inspection
    def _tier(self, trust: str) -> list[ReferenceEntry]:
        return [entry for entry in self.entries if entry.trust == trust]

    @property
    def high(self) -> list[ReferenceEntry]:
        return self._tier("high")

    @property
    def auto(self) -> list[ReferenceEntry]:
        return self._tier("auto")

    @property
    def medium(self) -> list[ReferenceEntry]:
        return self._tier("medium")

    @property
    def low(self) -> list[ReferenceEntry]:
        return self._tier("low")

    @property
    def has_confirmed(self) -> bool:
        return bool(self.high or self.auto)

    def payload(self) -> dict:
        self.flush_pending()
        poses = sorted({entry.pose for entry in self.entries})
        qualities = [entry.quality for entry in self.entries]
        return {
            "referenceBankSize": len(self.entries),
            "referenceConfirmedGameCrops": len(self.high),
            "referenceAutoCollected": len(self.auto),
            "referenceLibraryPhotos": len(self.medium) + len(self.low),
            "referencePoseBuckets": len(poses),
            "referencePoses": poses[:24],
            "referenceMeanQuality": round(float(np.mean(qualities)), 3) if qualities else 0.0,
            "referenceRejectedLowQuality": self.rejected_low_quality,
            "referenceEvicted": self.evicted,
            "matchSimilarityMeanAccepted": round(float(np.mean(self.positive_scores)), 3)
            if self.positive_scores
            else 0.0,
            "matchSimilarityP90Accepted": round(
                float(np.percentile(self.positive_scores, 90)), 3
            )
            if self.positive_scores
            else 0.0,
            "matchSimilarityMeanRejected": round(float(np.mean(self.rejected_scores)), 3)
            if self.rejected_scores
            else 0.0,
            "matchSimilaritySeparation": round(
                float(np.mean(self.positive_scores) - np.mean(self.rejected_scores)), 3
            )
            if self.positive_scores and self.rejected_scores
            else 0.0,
        }


# Backwards-compatible name used across the pipeline.
ReferenceGallery = ReferenceBank

__all__ = [
    "ReferenceBank",
    "ReferenceGallery",
    "ReferenceEntry",
    "bgr_to_hex",
    "colour_signature",
    "crop",
    "crop_quality",
    "hex_to_bgr",
    "region_means",
    "signature",
    "signatures_batch",
    "similarity",
    "uniform_affinity",
]
