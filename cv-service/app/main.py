"""FastAPI entry point implementing the application's analysis contract.

  POST /jobs                     -> { externalJobId }
  GET  /jobs/{id}/status         -> { status, progressPercent, currentStage }
  GET  /jobs/{id}/results        -> tracks, candidates, metrics, debug frames
  POST /jobs/{id}/cancel         -> {}
  GET  /health                   -> liveness + readiness summary
  GET  /ready                    -> component versions + device
"""

from __future__ import annotations

import hmac
import os
import platform
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, Header, HTTPException

from app.config import (
    PERSON_DETECTOR_VERSION,
    REID_VERSION,
    SERVICE_VERSION,
    TRACKER_VERSION,
    ConfigurationError,
    settings,
    validate_settings,
)
from app.jobs import registry
from app.logging_setup import get_logger
from app.models import JobRequest, StatusResponse, SubmitResponse

log = get_logger("cv.service")

_startup_error: str | None = None
_detector_info: dict = {}


def _detector_runtime() -> dict:
    """Actual loaded detector, warmed at startup so /ready never lies."""
    global _detector_info
    if _detector_info:
        return _detector_info
    try:
        from app.pipeline.run import detector  # noqa: PLC0415

        active = detector()
        _detector_info = {
            "backend": active.backend,
            "requested": active.requested_backend,
            "error": active.backend_error,
            "fp16": active.half,
            "version": active.version,
        }
    except Exception as error:  # noqa: BLE001
        log.exception("detector warmup failed")
        _detector_info = {
            "backend": "unavailable",
            "requested": settings.detector_backend,
            "error": f"{type(error).__name__}: {error}",
            "fp16": False,
            "version": None,
        }
    return _detector_info


def _device_name() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


_embedder_info: dict = {}


def _embedder_runtime() -> dict:
    """Warm the appearance embedder so /ready reports what actually loaded."""
    global _embedder_info
    if _embedder_info:
        return _embedder_info
    try:
        from app.pipeline.embedder import embedder  # noqa: PLC0415

        _embedder_info = embedder().stats()
    except Exception as error:  # noqa: BLE001
        log.exception("appearance embedder warmup failed")
        _embedder_info = {
            "embeddingModel": "unavailable",
            "embeddingModelRequested": settings.embedder_backend,
            "embeddingModelError": f"{type(error).__name__}: {error}",
        }
    _embedder_info = {
        **_embedder_info,
        "embeddingWeight": settings.embed_weight,
        "referenceTopK": settings.reference_top_k,
        "referenceMinQuality": settings.reference_min_quality,
        "autoReferenceCollection": settings.auto_reference_collect,
    }
    return _embedder_info


def _device_details() -> dict:
    cuda = torch.cuda.is_available()
    return {
        "device": _device_name(),
        "gpuAvailable": cuda,
        "gpuName": torch.cuda.get_device_name(0) if cuda else None,
        "torchVersion": torch.__version__,
        "threads": torch.get_num_threads(),
        "python": platform.python_version(),
    }


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _startup_error
    try:
        warnings = validate_settings()
        _startup_error = None
    except ConfigurationError as error:
        # Fail loudly and stay unhealthy rather than pretending to be ready.
        _startup_error = str(error)
        log.error("service startup failed: %s", error)
        raise
    for warning in warnings:
        log.warning("configuration warning: %s", warning)
    runtime = _detector_runtime()
    if runtime.get("backend") != settings.detector_backend and settings.detector_backend != "auto":
        log.error(
            "detector backend mismatch requested=%s active=%s error=%s",
            settings.detector_backend,
            runtime.get("backend"),
            runtime.get("error"),
        )
    log.info(
        "service startup complete version=%s device=%s workers=%d work_dir=%s "
        "analysis_fps=%s detection_resolution=%s max_frames=%s",
        SERVICE_VERSION,
        _device_name(),
        settings.max_workers,
        settings.work_dir,
        settings.analysis_fps,
        settings.detection_resolution,
        settings.max_frames,
    )
    yield
    log.info("service shutting down")


app = FastAPI(
    title="Player Analysis CV Service",
    version=SERVICE_VERSION,
    lifespan=lifespan,
)


def authorize(authorization: str | None) -> None:
    """Bearer auth. If no key is configured the service refuses to start work."""
    if not settings.api_key:
        raise HTTPException(status_code=503, detail="service_not_configured")
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token or not hmac.compare_digest(token, settings.api_key):
        raise HTTPException(status_code=401, detail="unauthorized")


def _readiness() -> dict:
    runtime = _detector_runtime()
    return {
        "ready": bool(settings.api_key) and _startup_error is None,
        "serviceVersion": SERVICE_VERSION,
        "personDetectorVersion": runtime.get("version") or PERSON_DETECTOR_VERSION,
        "trackerVersion": TRACKER_VERSION,
        "reidentificationVersion": REID_VERSION,
        "configured": bool(settings.api_key),
        "modelWeightsCached": os.path.isdir(os.environ.get("TORCH_HOME", "/models")),
        "activeJobs": registry.active_count(),
        "performance": {
            # Honest runtime values: what the detector ACTUALLY loaded, not what
            # was requested by configuration.
            "detectorBackend": runtime.get("backend") or "not_loaded",
            "detectorBackendRequested": settings.detector_backend,
            "detectorBackendError": runtime.get("error"),
            "fp16": runtime.get("fp16", settings.use_fp16),
            **_embedder_runtime(),
            "analysisFps": settings.analysis_fps,
            "detectionResolution": settings.detection_resolution,
            "batchSize": settings.batch_size,
            "detectEveryNthFrame": settings.detect_every,
            "reidIntervalSeconds": settings.reid_interval_seconds,
            "courtFilter": settings.court_filter,
            "deadTimeSkip": settings.dead_time_skip,
            "targetRecall": settings.target_recall,
            "targetRetainThreshold": settings.target_retain_threshold,
            "targetReacquireThreshold": settings.target_reacquire_threshold,
            "targetMinHeightFraction": settings.target_min_height_fraction,
            "targetMemorySeconds": settings.target_memory_seconds,
            "frameCap": settings.max_frames or None,
            "jobBudgetSeconds": settings.job_budget_seconds,
        },
        **_device_details(),
    }


@app.get("/health")
def health() -> dict:
    readiness = _readiness()
    return {
        "ok": readiness["ready"],
        "status": "healthy" if readiness["ready"] else "not_ready",
        "version": SERVICE_VERSION,
        "device": readiness["device"],
        "configured": readiness["configured"],
        "startupError": _startup_error,
        **{
            key: readiness[key]
            for key in (
                "personDetectorVersion",
                "trackerVersion",
                "reidentificationVersion",
                "gpuAvailable",
                "activeJobs",
            )
        },
    }


@app.get("/ready")
def ready() -> dict:
    readiness = _readiness()
    if not readiness["ready"]:
        raise HTTPException(status_code=503, detail=readiness)
    return readiness


@app.post("/jobs", response_model=SubmitResponse)
def create_job(request: JobRequest, authorization: str | None = Header(default=None)) -> SubmitResponse:
    authorize(authorization)
    if not request.video.url:
        raise HTTPException(status_code=422, detail="video_unavailable")
    state = registry.submit(request)
    return SubmitResponse(externalJobId=state.external_id)


@app.get("/jobs/{external_id}/status", response_model=StatusResponse)
def job_status(external_id: str, authorization: str | None = Header(default=None)) -> StatusResponse:
    authorize(authorization)
    state = registry.get(external_id)
    if state is None:
        raise HTTPException(status_code=404, detail="job_not_found")
    return StatusResponse(
        status=state.status,
        progressPercent=state.progress,
        currentStage=state.stage,
        errorCode=state.error_code,
        errorMessage=state.error_message,
    )


@app.get("/jobs/{external_id}/results")
def job_results(external_id: str, authorization: str | None = Header(default=None)) -> dict:
    authorize(authorization)
    state = registry.get(external_id)
    if state is None:
        raise HTTPException(status_code=404, detail="job_not_found")
    if state.results is None:
        raise HTTPException(status_code=409, detail="results_not_ready")
    log.info("results returned job=%s external=%s", state.request.jobId, external_id)
    return state.results


@app.post("/jobs/{external_id}/cancel")
def cancel(external_id: str, authorization: str | None = Header(default=None)) -> dict:
    authorize(authorization)
    registry.cancel(external_id)
    return {}
