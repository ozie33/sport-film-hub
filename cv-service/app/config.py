"""Service configuration. Every threshold is environment-configurable."""

import os
from dataclasses import dataclass

SERVICE_VERSION = "cv-service-0.1.0"
PERSON_DETECTOR_VERSION = "fasterrcnn_mobilenet_v3_large_fpn-coco-0.1"
TRACKER_VERSION = "iou-appearance-tracker-0.2"
REID_VERSION = "colorhist-torso-embed-0.2"


def _f(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, default))
    except (TypeError, ValueError):
        return default


def _i(key: str, default: int) -> int:
    try:
        return int(float(os.environ.get(key, default)))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class Settings:
    api_key: str | None = os.environ.get("ANALYSIS_SERVICE_API_KEY") or None
    work_dir: str = os.environ.get("CV_WORK_DIR", "/tmp/cv-jobs")
    max_workers: int = _i("CV_MAX_WORKERS", 1)
    # Analysis defaults; a job payload may override these.
    analysis_fps: float = _f("ANALYSIS_FPS", 5.0)
    detection_resolution: int = _i("ANALYSIS_DETECTION_RESOLUTION", 960)
    detection_confidence: float = _f("ANALYSIS_DETECTION_CONFIDENCE", 0.35)
    identity_high: float = _f("ANALYSIS_IDENTITY_HIGH", 0.80)
    identity_medium: float = _f("ANALYSIS_IDENTITY_MEDIUM", 0.55)
    confirmation_threshold: float = _f("ANALYSIS_CONFIRMATION_THRESHOLD", 0.55)
    pre_roll: float = _f("ANALYSIS_PRE_ROLL", 3.0)
    post_roll: float = _f("ANALYSIS_POST_ROLL", 4.0)
    ball_detection: bool = os.environ.get("ANALYSIS_BALL_DETECTION", "true") != "false"
    # Hard cap so a full game cannot run unbounded.
    max_frames: int = _i("CV_MAX_FRAMES", 9000)
    debug_frames: int = _i("CV_DEBUG_FRAMES", 6)


settings = Settings()
