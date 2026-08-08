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


def _device_name() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


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
    return {
        "ready": bool(settings.api_key) and _startup_error is None,
        "serviceVersion": SERVICE_VERSION,
        "personDetectorVersion": PERSON_DETECTOR_VERSION,
        "trackerVersion": TRACKER_VERSION,
        "reidentificationVersion": REID_VERSION,
        "configured": bool(settings.api_key),
        "modelWeightsCached": os.path.isdir(os.environ.get("TORCH_HOME", "/models")),
        "activeJobs": registry.active_count(),
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
