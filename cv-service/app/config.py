"""Service configuration. Every threshold is environment-configurable."""

import os
from dataclasses import dataclass

SERVICE_VERSION = "cv-service-0.4.0"
PERSON_DETECTOR_VERSION = "yolov8n-coco-fp16-0.2"
TRACKER_VERSION = "iou-proximity-stitch-tracker-0.5-targetrecall"
REID_VERSION = "colorhist-torso-embed-targetlock-0.5-targetrecall"


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
    analysis_fps: float = _f("ANALYSIS_FPS", 2.0)
    detection_resolution: int = _i("ANALYSIS_DETECTION_RESOLUTION", 640)
    detection_confidence: float = _f("ANALYSIS_DETECTION_CONFIDENCE", 0.35)
    identity_high: float = _f("ANALYSIS_IDENTITY_HIGH", 0.80)
    identity_medium: float = _f("ANALYSIS_IDENTITY_MEDIUM", 0.55)
    confirmation_threshold: float = _f("ANALYSIS_CONFIRMATION_THRESHOLD", 0.55)
    pre_roll: float = _f("ANALYSIS_PRE_ROLL", 3.0)
    post_roll: float = _f("ANALYSIS_POST_ROLL", 4.0)
    ball_detection: bool = os.environ.get("ANALYSIS_BALL_DETECTION", "true") != "false"
    # Detector backend / performance.
    detector_backend: str = os.environ.get("CV_DETECTOR", "yolo")
    yolo_weights: str = os.environ.get("CV_YOLO_WEIGHTS", "yolov8n.pt")
    yolo_imgsz: int = _i("CV_YOLO_IMGSZ", 640)
    use_fp16: bool = os.environ.get("CV_FP16", "true") != "false"
    batch_size: int = _i("CV_BATCH_SIZE", 32)
    # Detect every Nth sampled frame; motion-track in between.
    detect_every: int = _i("CV_DETECT_EVERY", 2)
    # Full re-identification cadence in seconds of video (event-driven otherwise).
    reid_interval_seconds: float = _f("CV_REID_INTERVAL_SECONDS", 5.0)
    # --- Phase 3D: association / continuity tuning -------------------------
    track_iou_threshold: float = _f("CV_TRACK_IOU", 0.15)
    track_max_age_seconds: float = _f("CV_TRACK_MAX_AGE_SECONDS", 3.0)
    track_max_speed_px: float = _f("CV_TRACK_MAX_SPEED_PX", 420.0)
    track_appearance_threshold: float = _f("CV_TRACK_APPEARANCE", 0.45)
    track_proximity_threshold: float = _f("CV_TRACK_PROXIMITY", 0.30)
    track_min_points: int = _i("CV_TRACK_MIN_POINTS", 3)
    track_min_seconds: float = _f("CV_TRACK_MIN_SECONDS", 0.75)
    # Tracklet stitching (post-pass).
    stitch_enabled: bool = os.environ.get("CV_STITCH", "true") != "false"
    stitch_max_gap_seconds: float = _f("CV_STITCH_MAX_GAP_SECONDS", 6.0)
    stitch_appearance_threshold: float = _f("CV_STITCH_APPEARANCE", 0.55)
    # Duplicate detection suppression before tracking.
    nms_iou_threshold: float = _f("CV_NMS_IOU", 0.65)
    min_person_height_fraction: float = _f("CV_MIN_PERSON_HEIGHT", 0.05)
    # Target lock behaviour.
    target_lock_threshold: float = _f("CV_TARGET_LOCK_THRESHOLD", 0.45)
    target_switch_margin: float = _f("CV_TARGET_SWITCH_MARGIN", 0.18)
    target_switch_frames: int = _i("CV_TARGET_SWITCH_FRAMES", 3)
    # --- Phase 3E: target recall / re-acquisition (target-only relaxations) ---
    target_recall: bool = os.environ.get("CV_TARGET_RECALL", "true") != "false"
    # Appearance agreement required to rescue a filtered detection as the target.
    target_recall_appearance: float = _f("CV_TARGET_RECALL_APPEARANCE", 0.50)
    # Lower bar when the candidate is close to the last known target position.
    target_recall_near_appearance: float = _f("CV_TARGET_RECALL_NEAR_APPEARANCE", 0.36)
    target_recall_near_px: float = _f("CV_TARGET_RECALL_NEAR_PX", 220.0)
    # Smaller target boxes are allowed than generic players (240p sources).
    target_min_height_fraction: float = _f("CV_TARGET_MIN_HEIGHT", 0.018)
    target_recall_max_per_frame: int = _i("CV_TARGET_RECALL_MAX_PER_FRAME", 2)
    target_court_confidence_penalty: float = _f("CV_TARGET_COURT_PENALTY", 0.85)
    # Retaining an established target is cheaper than re-acquiring it.
    target_retain_threshold: float = _f("CV_TARGET_RETAIN_THRESHOLD", 0.30)
    target_reacquire_threshold: float = _f("CV_TARGET_REACQUIRE_THRESHOLD", 0.34)
    # Short target memory: predicted motion carries the target through gaps.
    target_memory_seconds: float = _f("CV_TARGET_MEMORY_SECONDS", 3.0)
    confirmation_min_seconds: float = _f("CV_CONFIRMATION_MIN_SECONDS", 6.0)
    confirmation_max_requests: int = _i("CV_CONFIRMATION_MAX", 8)
    # Playing-area filtering.
    court_filter: bool = os.environ.get("CV_COURT_FILTER", "true") != "false"
    court_top_exclude: float = _f("CV_COURT_TOP_EXCLUDE", 0.18)
    court_min_height: float = _f("CV_COURT_MIN_HEIGHT", 0.035)
    court_max_height: float = _f("CV_COURT_MAX_HEIGHT", 0.85)
    # Dead-time skipping (timeouts, halftime stills, replays, off-court shots).
    dead_time_skip: bool = os.environ.get("CV_DEAD_TIME_SKIP", "true") != "false"
    dead_time_motion: float = _f("CV_DEAD_TIME_MOTION", 1.2)
    dead_time_scene: float = _f("CV_DEAD_TIME_SCENE", 0.28)
    # Safety limit: wall-clock budget for one job. Film is never silently
    # truncated by a frame cap; 0 disables the frame cap entirely.
    job_budget_seconds: float = _f("CV_JOB_BUDGET_SECONDS", 1500.0)
    max_frames: int = _i("CV_MAX_FRAMES", 0)
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
    if s.batch_size < 1:
        errors.append("CV_BATCH_SIZE must be at least 1.")
    if s.detect_every < 1:
        errors.append("CV_DETECT_EVERY must be at least 1.")
    if s.job_budget_seconds < 60:
        errors.append("CV_JOB_BUDGET_SECONDS must be at least 60.")
    if s.max_frames:
        warnings.append(
            f"CV_MAX_FRAMES is set to {s.max_frames}; long film will be truncated. "
            "Leave it at 0 and rely on CV_JOB_BUDGET_SECONDS for full coverage."
        )
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
