"""Person (and optional ball) detection.

Uses a torchvision COCO detector so the service has no external model-hosting
dependency. Detection and identity are separate concepts: a strong detection
says "a person is here", never "this is the selected athlete".
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch
from torchvision.models.detection import (
    FasterRCNN_MobileNet_V3_Large_FPN_Weights,
    fasterrcnn_mobilenet_v3_large_fpn,
)

COCO_PERSON = 1
COCO_SPORTS_BALL = 37


@dataclass
class Detection:
    timestamp: float
    box: tuple[float, float, float, float]  # x1, y1, x2, y2 in frame pixels
    confidence: float
    label: str  # "person" | "ball"


class PersonDetector:
    """Lazy-loaded detector; runs on CUDA when available, otherwise CPU."""

    def __init__(self) -> None:
        weights = FasterRCNN_MobileNet_V3_Large_FPN_Weights.DEFAULT
        self.model = fasterrcnn_mobilenet_v3_large_fpn(weights=weights)
        self.model.eval()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)

    @torch.inference_mode()
    def detect(
        self,
        frame: np.ndarray,
        timestamp: float,
        min_confidence: float,
        include_ball: bool,
    ) -> list[Detection]:
        rgb = frame[:, :, ::-1].copy()
        tensor = torch.from_numpy(rgb).permute(2, 0, 1).float().div(255.0).to(self.device)
        output = self.model([tensor])[0]

        detections: list[Detection] = []
        for box, score, label in zip(
            output["boxes"].cpu().numpy(),
            output["scores"].cpu().numpy(),
            output["labels"].cpu().numpy(),
        ):
            score = float(score)
            if score < min_confidence:
                continue
            if int(label) == COCO_PERSON:
                kind = "person"
            elif include_ball and int(label) == COCO_SPORTS_BALL:
                kind = "ball"
            else:
                continue
            x1, y1, x2, y2 = (float(v) for v in box)
            detections.append(
                Detection(timestamp=timestamp, box=(x1, y1, x2, y2), confidence=score, label=kind)
            )
        return detections
