"""Phase 3F.1 — appearance-similarity calibration.

Why this exists
---------------
Phase 3F swapped colour histograms for a learned ResNet-18 embedding. The model
works, but its cosine similarities live on a completely different scale: on the
0.5.1 baseline run, genuine target matches averaged 0.236 and non-targets 0.077,
while every gate (retain 0.30, reacquire 0.34, lock 0.45, rescue 0.50) was still
calibrated for histogram similarity. Almost every real detection therefore
failed a threshold it was never meant to be measured against — 926 failed
re-acquisitions and 7.35% target coverage.

The fix is calibration, not a new model:

  * raw similarity is mapped through a monotone piecewise-linear curve anchored
    on the run's OWN distributions (negatives high water mark, positive median,
    positive P90) so a "good match" lands near 0.8 regardless of scale
  * the positive distribution is primed from user-confirmed same-game crops
    (pairwise similarity inside the trusted tier) so the curve is usable from
    the first frame, before any tracking evidence exists
  * per-decision gates (retain / reacquire / lock / rescue) are percentiles of
    the CALIBRATED positive distribution, floored so they can never collapse,
    and always kept above the calibrated negative P95 by a margin. Non-target
    association is untouched — nothing here loosens generic matching.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# Calibrated-space anchor values. These are properties of the CURVE, not of any
# particular film: whatever the raw scale is, negatives land near 0.15 and a
# strong positive near 0.85.
NEGATIVE_ANCHOR = 0.15
POSITIVE_MEDIAN_ANCHOR = 0.60
POSITIVE_HIGH_ANCHOR = 0.85

# Percentile of the calibrated positive distribution used for each decision,
# plus an absolute floor so a noisy run cannot drive a gate to zero.
DECISION_RULES: dict[str, tuple[float, float]] = {
    # kind:            (percentile, floor)
    "retain": (8.0, 0.26),
    "rescue_near": (14.0, 0.30),
    "reacquire": (22.0, 0.36),
    "rescue": (32.0, 0.42),
    "lock": (40.0, 0.46),
}

# A gate must clear the calibrated negative P95 by this margin, so relaxing the
# target side never starts accepting other players.
NEGATIVE_MARGIN = 0.06


@dataclass
class SimilarityCalibrator:
    """Distribution-aware mapping from raw appearance cosine to 0..1 confidence."""

    enabled: bool = True
    min_positive_samples: int = 12
    positives: list[float] = field(default_factory=list)
    negatives: list[float] = field(default_factory=list)
    primed_positives: list[float] = field(default_factory=list)
    decisions: dict[str, dict[str, int]] = field(default_factory=dict)
    _anchors: tuple[float, float, float] | None = None
    _dirty: bool = True
    _sample_cap: int = 40000

    # ---------------------------------------------------------------- samples
    def observe_positive(self, value: float) -> None:
        if len(self.positives) < self._sample_cap:
            self.positives.append(float(value))
            self._dirty = True

    def observe_negative(self, value: float) -> None:
        if len(self.negatives) < self._sample_cap:
            self.negatives.append(float(value))
            self._dirty = True

    def prime_from_vectors(self, vectors: list[np.ndarray]) -> int:
        """Seed the positive distribution from trusted same-game crops.

        Pairwise similarity inside the confirmed tier is by definition a
        same-athlete distribution, so it tells us the scale of a true positive
        for THIS film before any tracking has happened.
        """
        usable = [v for v in vectors if v is not None and getattr(v, "size", 0)]
        if len(usable) < 2:
            return 0
        added = 0
        for i in range(len(usable)):
            for j in range(i + 1, len(usable)):
                a, b = usable[i], usable[j]
                if a.size != b.size:
                    continue
                denom = float(np.linalg.norm(a) * np.linalg.norm(b))
                if denom == 0:
                    continue
                value = float(np.dot(a, b)) / denom
                self.primed_positives.append(value)
                self.observe_positive(value)
                added += 1
        return added

    # ---------------------------------------------------------------- anchors
    @property
    def warm(self) -> bool:
        return len(self.positives) >= max(2, self.min_positive_samples)

    def anchors(self) -> tuple[float, float, float]:
        """(negative high-water, positive median, positive P90) in RAW space."""
        if self._anchors is not None and not self._dirty:
            return self._anchors
        if not self.warm:
            # Cold start: assume the embedding scale seen in Phase 3F baselines
            # rather than the histogram scale the old gates assumed.
            anchors = (0.08, 0.24, 0.45)
        else:
            positives = np.asarray(self.positives, dtype=np.float32)
            negatives = (
                np.asarray(self.negatives, dtype=np.float32)
                if len(self.negatives) >= 8
                else None
            )
            pos_median = float(np.percentile(positives, 50))
            pos_high = float(np.percentile(positives, 90))
            neg_high = (
                float(np.percentile(negatives, 90)) if negatives is not None else pos_median * 0.35
            )
            anchors = (neg_high, pos_median, pos_high)
        # Enforce strict monotonicity — the mapping must stay invertible.
        neg_high, pos_median, pos_high = anchors
        neg_high = max(0.0, min(0.9, neg_high))
        pos_median = max(neg_high + 1e-3, pos_median)
        pos_high = max(pos_median + 1e-3, pos_high)
        self._anchors = (neg_high, pos_median, pos_high)
        self._dirty = False
        return self._anchors

    # ------------------------------------------------------------- mapping
    def normalize(self, raw: float) -> float:
        """Map raw cosine to a stable 0..1 confidence."""
        if not self.enabled:
            return float(max(0.0, min(1.0, raw)))
        value = float(max(0.0, min(1.0, raw)))
        neg, mid, high = self.anchors()
        xs = (0.0, neg, mid, high, 1.0)
        ys = (0.0, NEGATIVE_ANCHOR, POSITIVE_MEDIAN_ANCHOR, POSITIVE_HIGH_ANCHOR, 1.0)
        for index in range(1, len(xs)):
            if value <= xs[index] or index == len(xs) - 1:
                x0, x1 = xs[index - 1], xs[index]
                y0, y1 = ys[index - 1], ys[index]
                if x1 <= x0:
                    return float(y1)
                ratio = (value - x0) / (x1 - x0)
                return float(max(0.0, min(1.0, y0 + ratio * (y1 - y0))))
        return value

    def denormalize(self, calibrated: float) -> float:
        """Inverse mapping — used only to report gates in raw cosine terms."""
        neg, mid, high = self.anchors()
        xs = (0.0, neg, mid, high, 1.0)
        ys = (0.0, NEGATIVE_ANCHOR, POSITIVE_MEDIAN_ANCHOR, POSITIVE_HIGH_ANCHOR, 1.0)
        value = float(max(0.0, min(1.0, calibrated)))
        for index in range(1, len(ys)):
            if value <= ys[index] or index == len(ys) - 1:
                y0, y1 = ys[index - 1], ys[index]
                x0, x1 = xs[index - 1], xs[index]
                if y1 <= y0:
                    return float(x1)
                ratio = (value - y0) / (y1 - y0)
                return float(x0 + ratio * (x1 - x0))
        return value

    # ------------------------------------------------------------ thresholds
    def threshold(self, kind: str) -> float:
        """Percentile-derived gate for one decision, in CALIBRATED space."""
        percentile, floor = DECISION_RULES.get(kind, (25.0, 0.35))
        if not self.enabled:
            return floor
        gate = floor
        if self.warm:
            calibrated = [self.normalize(value) for value in self.positives]
            gate = float(np.percentile(np.asarray(calibrated, dtype=np.float32), percentile))
            gate = max(floor * 0.85, gate)
        if len(self.negatives) >= 16:
            negative_gate = (
                float(
                    np.percentile(
                        np.asarray([self.normalize(v) for v in self.negatives], dtype=np.float32),
                        95,
                    )
                )
                + NEGATIVE_MARGIN
            )
            gate = max(gate, negative_gate)
        return float(max(0.05, min(0.95, gate)))

    def thresholds(self) -> dict[str, float]:
        return {kind: round(self.threshold(kind), 3) for kind in DECISION_RULES}

    # -------------------------------------------------------------- decisions
    def note_decision(self, kind: str, accepted: bool) -> None:
        bucket = self.decisions.setdefault(kind, {"accepted": 0, "rejected": 0})
        bucket["accepted" if accepted else "rejected"] += 1

    def gate(self, kind: str, calibrated: float) -> bool:
        accepted = calibrated >= self.threshold(kind)
        self.note_decision(kind, accepted)
        return accepted

    # ------------------------------------------------------------ diagnostics
    @staticmethod
    def _distribution(values: list[float]) -> dict:
        if not values:
            return {"count": 0}
        array = np.asarray(values, dtype=np.float32)
        return {
            "count": int(array.size),
            "mean": round(float(array.mean()), 4),
            "p10": round(float(np.percentile(array, 10)), 4),
            "p50": round(float(np.percentile(array, 50)), 4),
            "p90": round(float(np.percentile(array, 90)), 4),
            "max": round(float(array.max()), 4),
        }

    def payload(self) -> dict:
        neg, mid, high = self.anchors()
        calibrated_positive = [self.normalize(v) for v in self.positives]
        return {
            "calibrationEnabled": self.enabled,
            "calibrationWarm": self.warm,
            "calibrationPrimedFromConfirmedCrops": len(self.primed_positives),
            "rawPositiveSimilarity": self._distribution(self.positives),
            "rawNegativeSimilarity": self._distribution(self.negatives),
            "normalizedPositiveSimilarity": self._distribution(calibrated_positive),
            "normalizedNegativeSimilarity": self._distribution(
                [self.normalize(v) for v in self.negatives]
            ),
            "calibrationAnchorsRaw": {
                "negativeHighWater": round(neg, 4),
                "positiveMedian": round(mid, 4),
                "positiveP90": round(high, 4),
            },
            "calibratedThresholds": self.thresholds(),
            "calibratedThresholdsRawEquivalent": {
                kind: round(self.denormalize(value), 4)
                for kind, value in self.thresholds().items()
            },
            "decisionsByThreshold": {
                kind: dict(counts) for kind, counts in sorted(self.decisions.items())
            },
        }


_calibrator: SimilarityCalibrator | None = None


def calibrator() -> SimilarityCalibrator:
    """Process-wide calibrator. Reset per job via `reset_calibrator`."""
    global _calibrator
    if _calibrator is None:
        from app.config import settings  # noqa: PLC0415 - avoid import cycle at module load

        _calibrator = SimilarityCalibrator(
            enabled=settings.similarity_calibration,
            min_positive_samples=settings.calibration_min_positives,
        )
    return _calibrator


def reset_calibrator() -> SimilarityCalibrator:
    global _calibrator
    _calibrator = None
    return calibrator()
