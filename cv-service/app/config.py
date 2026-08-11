"""Service configuration. Every threshold is environment-configurable."""

import os
from dataclasses import dataclass

SERVICE_VERSION = "cv-service-0.6.0"
PERSON_DETECTOR_VERSION = "yolov8n-coco-fp16-0.2"
TRACKER_VERSION = "iou-proximity-stitch-tracker-0.6-hysteresis"
REID_VERSION = "resnet18-embed+colorhist-referencebank-0.8.0-twostage-calibrated"
EMBEDDING_VERSION = "resnet18-imagenet-softcentered-flipavg-0.2"


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
    # Phase 3G hysteresis: switching away from the target costs more than staying.
    target_switch_margin: float = _f("CV_TARGET_SWITCH_MARGIN", 0.24)
    target_switch_frames: int = _i("CV_TARGET_SWITCH_FRAMES", 4)
    # Retention discount applied to the retain gate for the CURRENT target only.
    target_hysteresis_bonus: float = _f("CV_TARGET_HYSTERESIS_BONUS", 0.05)
    # --- Phase 3E: target recall / re-acquisition (target-only relaxations) ---
    target_recall: bool = os.environ.get("CV_TARGET_RECALL", "true") != "false"
    # Appearance agreement required to rescue a filtered detection as the target.
    target_recall_appearance: float = _f("CV_TARGET_RECALL_APPEARANCE", 0.50)
    # Lower bar when the candidate is close to the last known target position.
    target_recall_near_appearance: float = _f("CV_TARGET_RECALL_NEAR_APPEARANCE", 0.36)
    target_recall_near_px: float = _f("CV_TARGET_RECALL_NEAR_PX", 220.0)
    # Beyond this distance a rescue must match strongly (context penalty).
    target_recall_far_px: float = _f("CV_TARGET_RECALL_FAR_PX", 520.0)
    # Phase 3G context-aware rescue adjustments (subtracted from the gate).
    rescue_motion_bonus: float = _f("CV_RESCUE_MOTION_BONUS", 0.06)
    rescue_uniform_bonus: float = _f("CV_RESCUE_UNIFORM_BONUS", 0.05)
    rescue_uniform_min: float = _f("CV_RESCUE_UNIFORM_MIN", 0.62)
    rescue_context_bonus_max: float = _f("CV_RESCUE_CONTEXT_BONUS_MAX", 0.10)
    rescue_far_penalty: float = _f("CV_RESCUE_FAR_PENALTY", 0.08)
    # Smaller target boxes are allowed than generic players (240p sources).
    target_min_height_fraction: float = _f("CV_TARGET_MIN_HEIGHT", 0.018)
    target_recall_max_per_frame: int = _i("CV_TARGET_RECALL_MAX_PER_FRAME", 3)
    target_court_confidence_penalty: float = _f("CV_TARGET_COURT_PENALTY", 0.85)
    # Retaining an established target is cheaper than re-acquiring it.
    # Phase 3F.1: these are FALLBACKS. When similarity calibration is on, the
    # live gates come from percentiles of the calibrated positive distribution.
    target_retain_threshold: float = _f("CV_TARGET_RETAIN_THRESHOLD", 0.26)
    target_reacquire_threshold: float = _f("CV_TARGET_REACQUIRE_THRESHOLD", 0.36)
    # Short target memory: predicted motion carries the target through gaps.
    target_memory_seconds: float = _f("CV_TARGET_MEMORY_SECONDS", 3.0)
    confirmation_min_seconds: float = _f("CV_CONFIRMATION_MIN_SECONDS", 6.0)
    confirmation_max_requests: int = _i("CV_CONFIRMATION_MAX", 8)
    # --- Phase 3G: two-stage re-ID + embedding cache ----------------------
    # Stage 1 is a cheap motion/spatial/uniform shortlist; stage 2 embeds only
    # the top candidates. Generic association still gets a signature (cached).
    reid_shortlist: bool = os.environ.get("CV_REID_SHORTLIST", "true") != "false"
    reid_shortlist_top_k: int = _i("CV_REID_SHORTLIST_TOP_K", 6)
    embedding_cache: bool = os.environ.get("CV_EMBED_CACHE", "true") != "false"
    embedding_cache_seconds: float = _f("CV_EMBED_CACHE_SECONDS", 1.6)
    embedding_cache_min_iou: float = _f("CV_EMBED_CACHE_MIN_IOU", 0.62)
    embedding_cache_max_entries: int = _i("CV_EMBED_CACHE_MAX", 64)
    # Compact prototype bank: representative reference views tried first.
    prototype_bank: bool = os.environ.get("CV_PROTOTYPE_BANK", "true") != "false"
    prototype_count: int = _i("CV_PROTOTYPE_COUNT", 6)
    prototype_ambiguous_margin: float = _f("CV_PROTOTYPE_AMBIGUOUS_MARGIN", 0.06)
    # --- Phase 3G: candidate generation -----------------------------------
    candidate_min_segment_seconds: float = _f("CV_CANDIDATE_MIN_SEGMENT", 0.3)
    candidate_gap_limit_seconds: float = _f("CV_CANDIDATE_GAP_LIMIT", 3.5)
    # --- Phase 3F: learned appearance embedding ---------------------------
    # Primary appearance signal. "none" falls back to colour histograms only.
    embedder_backend: str = os.environ.get("CV_EMBEDDER", "resnet18")
    embed_weight: float = _f("CV_EMBED_WEIGHT", 0.75)
    embed_width: int = _i("CV_EMBED_WIDTH", 128)
    embed_height: int = _i("CV_EMBED_HEIGHT", 256)
    embed_batch_size: int = _i("CV_EMBED_BATCH", 64)
    embed_flip_average: bool = os.environ.get("CV_EMBED_FLIP", "true") != "false"
    embed_center: bool = os.environ.get("CV_EMBED_CENTER", "true") != "false"
    # Phase 3F.1: full mean subtraction compressed genuine positives. Softened.
    embed_center_strength: float = _f("CV_EMBED_CENTER_STRENGTH", 0.5)
    embed_mean_momentum: float = _f("CV_EMBED_MEAN_MOMENTUM", 0.02)
    # --- Phase 3F.1: appearance-similarity calibration --------------------
    similarity_calibration: bool = os.environ.get("CV_SIMILARITY_CALIBRATION", "true") != "false"
    calibration_min_positives: int = _i("CV_CALIBRATION_MIN_POSITIVES", 12)
    # Reference bank (multi-view, quality scored).
    reference_top_k: int = _i("CV_REFERENCE_TOP_K", 3)
    reference_min_quality: float = _f("CV_REFERENCE_MIN_QUALITY", 0.34)
    reference_max_per_pose: int = _i("CV_REFERENCE_MAX_PER_POSE", 4)
    reference_max_confirmed: int = _i("CV_REFERENCE_MAX_CONFIRMED", 48)
    reference_max_library: int = _i("CV_REFERENCE_MAX_LIBRARY", 24)
    # Automatic in-game reference collection while locked on the target.
    auto_reference_collect: bool = os.environ.get("CV_AUTO_REFERENCE", "true") != "false"
    auto_reference_min_score: float = _f("CV_AUTO_REFERENCE_MIN_SCORE", 0.55)
    auto_reference_min_quality: float = _f("CV_AUTO_REFERENCE_MIN_QUALITY", 0.45)
    auto_reference_interval_seconds: float = _f("CV_AUTO_REFERENCE_INTERVAL", 12.0)
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
    if not 0 <= s.embed_weight <= 0.95:
        errors.append("CV_EMBED_WEIGHT must be between 0 and 0.95.")
    if not 0 <= s.embed_center_strength <= 1:
        errors.append("CV_EMBED_CENTER_STRENGTH must be between 0 and 1.")
    if s.calibration_min_positives < 2:
        errors.append("CV_CALIBRATION_MIN_POSITIVES must be at least 2.")
    if not s.similarity_calibration:
        warnings.append(
            "CV_SIMILARITY_CALIBRATION is disabled; learned-embedding similarity "
            "is compared against fixed histogram-era thresholds and target "
            "recall will suffer."
        )
    if s.embed_height < 64 or s.embed_width < 32:
        errors.append("CV_EMBED_HEIGHT/CV_EMBED_WIDTH are too small (min 64x32).")
    if s.reference_top_k < 1:
        errors.append("CV_REFERENCE_TOP_K must be at least 1.")
    if s.reid_shortlist_top_k < 1:
        errors.append("CV_REID_SHORTLIST_TOP_K must be at least 1.")
    if s.prototype_count < 1:
        errors.append("CV_PROTOTYPE_COUNT must be at least 1.")
    if not 0 <= s.embedding_cache_min_iou <= 0.95:
        errors.append("CV_EMBED_CACHE_MIN_IOU must be between 0 and 0.95.")
    if s.candidate_min_segment_seconds <= 0:
        errors.append("CV_CANDIDATE_MIN_SEGMENT must be greater than 0.")
    if s.embedder_backend == "none":
        warnings.append(
            "CV_EMBEDDER is 'none'; identity matching falls back to colour "
            "histograms, which are weak on low-resolution film."
        )
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
