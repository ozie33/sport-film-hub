"""Person (and optional ball) detection.

Primary backend is a modern real-time YOLO detector running batched fp16 on
GPU. A torchvision Faster R-CNN backend is kept as a fallback so the service
still works if YOLO weights are unavailable.

Detection and identity are separate concepts: a strong detection says "a person
is here", never "this is the selected athlete".
"""

from __future__ import annotations

from dataclasses import dataclass
import os

import numpy as np
import torch

from app.config import settings
from app.logging_setup import get_logger
from app.pipeline.tracker import iou as box_iou

log = get_logger("cv.detector")

COCO_PERSON = 1
COCO_SPORTS_BALL = 37
YOLO_PERSON = 0
YOLO_SPORTS_BALL = 32


@dataclass
class Detection:
    timestamp: float
    box: tuple[float, float, float, float]  # x1, y1, x2, y2 in frame pixels
    confidence: float
    label: str  # "person" | "ball"


def suppress_duplicates(
    detections: list[Detection],
    iou_threshold: float,
    min_height_fraction: float,
    frame_height: int,
) -> tuple[list[Detection], int]:
    """Remove overlapping duplicate person boxes and tiny non-player boxes.

    Duplicate detections were a direct cause of track fragmentation: two boxes
    on one athlete alternate ownership of the track and split it in half.
    """
    kept: list[Detection] = []
    dropped = 0
    for detection in sorted(detections, key=lambda d: d.confidence, reverse=True):
        if detection.label == "person":
            height = (detection.box[3] - detection.box[1]) / max(1.0, float(frame_height))
            if height < min_height_fraction:
                dropped += 1
                continue
        duplicate = False
        for existing in kept:
            if existing.label != detection.label:
                continue
            if box_iou(existing.box, detection.box) >= iou_threshold:
                duplicate = True
                break
        if duplicate:
            dropped += 1
            continue
        kept.append(detection)
    return kept, dropped


class PersonDetector:
    """Lazy-loaded detector; batched fp16 CUDA inference when available."""

    def __init__(self, backend: str | None = None) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.half = self.device.type == "cuda" and settings.use_fp16
        requested = (backend or settings.detector_backend).lower()
        self.backend = "torchvision"
        self.model = None
        self.version = "fasterrcnn_mobilenet_v3_large_fpn-coco-0.1"
        self.requested_backend = requested
        self.backend_error: str | None = None

        if requested in {"yolo", "auto"}:
            try:
                from ultralytics import YOLO  # noqa: PLC0415

                weights = settings.yolo_weights
                if not os.path.exists(weights):
                    # Baked path may be missing on some hosts; fall back to the
                    # plain weight name so ultralytics resolves/downloads it.
                    fallback = os.path.basename(weights) or "yolov8n.pt"
                    log.warning(
                        "yolo weights not found at %s, trying %s", weights, fallback
                    )
                    weights = fallback
                self.model = YOLO(weights)
                self.model.to(self.device)
                # Order matters: ultralytics `fuse()` runs a FLOPs probe with a
                # float dummy tensor, so casting weights to fp16 first raises
                # "expected mat1 and mat2 to have the same dtype". Fuse in fp32,
                # then let `predict(half=True)` handle precision itself.
                try:
                    self.model.fuse()
                except Exception as fuse_error:  # noqa: BLE001
                    log.warning("yolo fuse skipped: %s", fuse_error)
                self.backend = "yolo"
                self.version = f"{os.path.basename(weights)}-coco-{'fp16' if self.half else 'fp32'}"
                # Real forward pass at load time: if inference cannot actually
                # run, fall back now instead of advertising YOLO and failing later.
                probe = np.zeros((settings.yolo_imgsz, settings.yolo_imgsz, 3), dtype=np.uint8)
                self.model.predict(
                    [probe],
                    imgsz=settings.yolo_imgsz,
                    conf=0.5,
                    classes=[YOLO_PERSON],
                    device=self.device,
                    half=self.half,
                    verbose=False,
                )
            except Exception as error:  # noqa: BLE001
                self.backend_error = f"{type(error).__name__}: {error}"
                log.exception(
                    "yolo backend unavailable, falling back to torchvision weights=%s",
                    settings.yolo_weights,
                )
                self.model = None
                self.backend = "torchvision"

        if self.model is None:
            from torchvision.models.detection import (  # noqa: PLC0415
                FasterRCNN_MobileNet_V3_Large_FPN_Weights,
                fasterrcnn_mobilenet_v3_large_fpn,
            )

            weights = FasterRCNN_MobileNet_V3_Large_FPN_Weights.DEFAULT
            model = fasterrcnn_mobilenet_v3_large_fpn(weights=weights)
            model.eval()
            model.to(self.device)
            self.model = model
            self.backend = "torchvision"

        if self.device.type == "cuda":
            torch.backends.cudnn.benchmark = True
        log.info(
            "detector ready backend=%s requested=%s device=%s fp16=%s version=%s error=%s",
            self.backend,
            self.requested_backend,
            self.device.type,
            self.half,
            self.version,
            self.backend_error or "none",
        )

    # ------------------------------------------------------------------ public

    @torch.inference_mode()
    def detect_batch(
        self,
        frames: list[np.ndarray],
        timestamps: list[float],
        min_confidence: float,
        include_ball: bool,
    ) -> list[list[Detection]]:
        """One forward pass for the whole batch of frames."""
        if not frames:
            return []
        if self.backend == "yolo":
            return self._detect_yolo(frames, timestamps, min_confidence, include_ball)
        return self._detect_torchvision(frames, timestamps, min_confidence, include_ball)

    def detect(
        self,
        frame: np.ndarray,
        timestamp: float,
        min_confidence: float,
        include_ball: bool,
    ) -> list[Detection]:
        return self.detect_batch([frame], [timestamp], min_confidence, include_ball)[0]

    # ----------------------------------------------------------------- private

    def _detect_yolo(self, frames, timestamps, min_confidence, include_ball):
        classes = [YOLO_PERSON] + ([YOLO_SPORTS_BALL] if include_ball else [])
        outputs = self.model.predict(
            frames,
            imgsz=settings.yolo_imgsz,
            conf=min_confidence,
            classes=classes,
            device=self.device,
            half=self.half,
            verbose=False,
        )
        batch: list[list[Detection]] = []
        for timestamp, result in zip(timestamps, outputs):
            detections: list[Detection] = []
            boxes = result.boxes
            if boxes is not None and boxes.shape[0]:
                xyxy = boxes.xyxy.float().cpu().numpy()
                conf = boxes.conf.float().cpu().numpy()
                cls = boxes.cls.int().cpu().numpy()
                for box, score, label in zip(xyxy, conf, cls):
                    kind = "person" if int(label) == YOLO_PERSON else "ball"
                    detections.append(
                        Detection(
                            timestamp=timestamp,
                            box=(float(box[0]), float(box[1]), float(box[2]), float(box[3])),
                            confidence=float(score),
                            label=kind,
                        )
                    )
            batch.append(detections)
        return batch

    def _detect_torchvision(self, frames, timestamps, min_confidence, include_ball):
        tensors = [
            torch.from_numpy(frame[:, :, ::-1].copy())
            .permute(2, 0, 1)
            .float()
            .div(255.0)
            .to(self.device, non_blocking=True)
            for frame in frames
        ]
        if self.half:
            with torch.autocast("cuda", dtype=torch.float16):
                outputs = self.model(tensors)
        else:
            outputs = self.model(tensors)

        batch: list[list[Detection]] = []
        for timestamp, output in zip(timestamps, outputs):
            detections: list[Detection] = []
            for box, score, label in zip(
                output["boxes"].float().cpu().numpy(),
                output["scores"].float().cpu().numpy(),
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
            batch.append(detections)
        return batch
