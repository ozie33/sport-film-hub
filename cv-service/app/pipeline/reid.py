"""Appearance representation and re-identification.

Deliberately does NOT use face recognition and does not depend exclusively on
jersey OCR. The signature combines torso/short colour histograms with uniform
colour affinity, which survives the low resolution of wide-angle game film.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

BINS = (8, 8, 8)


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


def signature(frame: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    """Torso-weighted appearance vector for one detection."""
    patch = crop(frame, box)
    if patch.size == 0:
        return np.zeros(BINS[0] * BINS[1] * BINS[2] * 2, dtype=np.float32)
    height = patch.shape[0]
    torso = patch[int(height * 0.15) : int(height * 0.55)]
    legs = patch[int(height * 0.55) : int(height * 0.95)]
    return np.concatenate([_hist(torso), _hist(legs)])


def similarity(a: np.ndarray, b: np.ndarray) -> float:
    if a.size == 0 or b.size == 0 or a.size != b.size:
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


@dataclass
class ReferenceGallery:
    """High-trust (user-confirmed) and low-trust appearance signatures."""

    high: list[np.ndarray] = field(default_factory=list)
    medium: list[np.ndarray] = field(default_factory=list)
    low: list[np.ndarray] = field(default_factory=list)

    def add(self, vector: np.ndarray, trust: str) -> None:
        if vector.size == 0:
            return
        if trust == "high":
            self.high.append(vector)
        elif trust == "medium":
            self.medium.append(vector)
        else:
            self.low.append(vector)

    def score(self, vector: np.ndarray) -> float:
        """Trust-weighted best match. AI-generated crops never dominate."""
        best = 0.0
        for weight, bucket in ((1.0, self.high), (0.75, self.medium), (0.4, self.low)):
            for reference in bucket:
                best = max(best, weight * similarity(vector, reference))
        return best

    @property
    def has_confirmed(self) -> bool:
        return bool(self.high)
