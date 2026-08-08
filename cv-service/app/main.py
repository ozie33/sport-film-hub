"""FastAPI entry point implementing the application's analysis contract.

  POST /jobs                     -> { externalJobId }
  GET  /jobs/{id}/status         -> { status, progressPercent, currentStage }
  GET  /jobs/{id}/results        -> tracks, candidates, metrics, debug frames
  POST /jobs/{id}/cancel         -> {}
  GET  /health                   -> { ok, version, device }
"""

from __future__ import annotations

import hmac

import torch
from fastapi import FastAPI, Header, HTTPException

from app.config import SERVICE_VERSION, settings
from app.jobs import registry
from app.models import JobRequest, StatusResponse, SubmitResponse

app = FastAPI(title="Player Analysis CV Service", version=SERVICE_VERSION)


def authorize(authorization: str | None) -> None:
    """Bearer auth. If no key is configured the service refuses to start work."""
    if not settings.api_key:
        raise HTTPException(status_code=503, detail="service_not_configured")
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token or not hmac.compare_digest(token, settings.api_key):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "version": SERVICE_VERSION,
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "configured": bool(settings.api_key),
    }


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
    return state.results


@app.post("/jobs/{external_id}/cancel")
def cancel(external_id: str, authorization: str | None = Header(default=None)) -> dict:
    authorize(authorization)
    registry.cancel(external_id)
    return {}
