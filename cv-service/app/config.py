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


class ConfigurationError(RuntimeError):
    """Raised at startup when required configuration is missing or invalid."""


def validate_settings(s: Settings = settings) -> list[str]:
    """Fail fast with a clear message when the service is misconfigured.

    Returns a list of non-fatal warnings; raises ConfigurationError on anything
    that would make the service unable to do real work.
    """
    errors: list[str] = []
    warnings: list[str] = []

    if not s.api_key:
        errors.append(
            "ANALYSIS_SERVICE_API_KEY is not set. The service refuses to run "
            "unauthenticated. Set it to the same value as the application secret."
        )
    elif len(s.api_key) < 16:
        errors.append(
            "ANALYSIS_SERVICE_API_KEY is too short (min 16 characters) - use a "
            "high-entropy random value."
        )

    try:
        os.makedirs(s.work_dir, exist_ok=True)
        probe = os.path.join(s.work_dir, ".write-test")
        with open(probe, "w") as handle:
            handle.write("ok")
        os.remove(probe)
    except OSError as error:
        errors.append(
            f"CV_WORK_DIR ({s.work_dir}) is not writable: {error}. Temporary film "
            "cannot be downloaded."
        )

    if s.analysis_fps <= 0:
        errors.append("ANALYSIS_FPS must be greater than 0.")
    if s.detection_resolution < 320:
        errors.append("ANALYSIS_DETECTION_RESOLUTION must be at least 320.")
    if not 0 < s.detection_confidence < 1:
        errors.append("ANALYSIS_DETECTION_CONFIDENCE must be between 0 and 1.")
    if not 0 < s.confirmation_threshold < 1:
        errors.append("ANALYSIS_CONFIRMATION_THRESHOLD must be between 0 and 1.")
    if s.max_workers < 1:
        errors.append("CV_MAX_WORKERS must be at least 1.")

    if not os.environ.get("APP_BASE_URL"):
        warnings.append(
            "APP_BASE_URL is not set on the service. It is only used for outbound "
            "callbacks/diagnostics; the application must also set it so Drive film "
            "can be streamed."
        )
    torch_home = os.environ.get("TORCH_HOME")
    if not torch_home:
        warnings.append(
            "TORCH_HOME is not set; detector weights will download to the default "
            "cache on every fresh container. Set TORCH_HOME to a baked/persistent path."
        )

    if errors:
        raise ConfigurationError(
            "CV service configuration is invalid:\n  - " + "\n  - ".join(errors)
        )
    return warnings
