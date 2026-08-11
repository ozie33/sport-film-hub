"""Reference-crop quality scoring and pose bucketing (Phase 3F).

A reference bank is only as good as the crops in it. A blurry 14-pixel smear of
the athlete is worse than no reference at all: it matches everything. Every crop
that wants to become a trusted reference is scored on

  * size        — box height relative to the frame
  * sharpness   — variance of the Laplacian, normalised
  * visibility  — exposure/contrast sanity (not blown out, not black)
  * occlusion   — aspect-ratio plausibility for a standing/running person

and assigned a coarse pose bucket so the bank can keep views from different
angles and court locations instead of ten copies of the same frame.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class CropQuality:
    score: float
    size: float
    sharpness: float
    visibility: float
    occlusion: float
    pose: str

    @property
    def acceptable(self) -> bool:
        return self.score > 0.0


def _pose_bucket(patch: np.ndarray, box, frame_width: int, frame_height: int) -> str:
    """Coarse pose/context bucket: facing tendency + court region."""
    height = max(1.0, float(box[3] - box[1]))
    width = max(1.0, float(box[2] - box[0]))
    aspect = width / height
    if patch.size:
        grey = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
        left = float(grey[:, : max(1, grey.shape[1] // 2)].mean())
        right = float(grey[:, grey.shape[1] // 2 :].mean())
        asymmetry = (left - right) / max(1.0, left + right)
    else:
        asymmetry = 0.0
    facing = "wide" if aspect > 0.62 else "side" if abs(asymmetry) > 0.08 else "front_back"
    cx = ((box[0] + box[2]) / 2.0) / max(1.0, float(frame_width))
    cy = ((box[1] + box[3]) / 2.0) / max(1.0, float(frame_height))
    zone = f"{'l' if cx < 0.34 else 'c' if cx < 0.67 else 'r'}{'t' if cy < 0.5 else 'b'}"
    return f"{facing}:{zone}"


def crop_quality(frame: np.ndarray, box, patch: np.ndarray | None = None) -> CropQuality:
    frame_height, frame_width = frame.shape[:2]
    if patch is None:
        x1 = max(0, int(box[0]))
        y1 = max(0, int(box[1]))
        x2 = min(frame_width, int(box[2]))
        y2 = min(frame_height, int(box[3]))
        patch = frame[y1:y2, x1:x2] if x2 > x1 and y2 > y1 else np.zeros((0, 0, 3), np.uint8)
    if patch.size == 0:
        return CropQuality(0.0, 0.0, 0.0, 0.0, 0.0, "unknown")

    box_height = float(box[3] - box[1])
    box_width = float(box[2] - box[0])
    size = min(1.0, (box_height / max(1.0, float(frame_height))) / 0.22)

    grey = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
    sharpness = min(1.0, float(cv2.Laplacian(grey, cv2.CV_64F).var()) / 120.0)

    mean = float(grey.mean())
    spread = float(grey.std())
    visibility = min(1.0, spread / 42.0) * (1.0 if 22.0 <= mean <= 232.0 else 0.4)

    aspect = box_width / max(1.0, box_height)
    # A full standing/running person sits around 0.30-0.60. Far from that is a
    # cropped, merged or occluded box.
    occlusion = max(0.0, 1.0 - abs(aspect - 0.45) / 0.45)

    score = 0.34 * size + 0.30 * sharpness + 0.18 * visibility + 0.18 * occlusion
    pose = _pose_bucket(patch, box, frame_width, frame_height)
    return CropQuality(
        score=round(float(max(0.0, min(1.0, score))), 3),
        size=round(size, 3),
        sharpness=round(sharpness, 3),
        visibility=round(visibility, 3),
        occlusion=round(occlusion, 3),
        pose=pose,
    )
