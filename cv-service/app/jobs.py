"""In-process job registry and worker.

Swap this for a queue (Redis/Celery/SQS) when running more than one replica —
the HTTP contract does not change.
"""

from __future__ import annotations

import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from app.config import settings
from app.models import JobRequest
from app.pipeline.run import run_job


@dataclass
class JobState:
    external_id: str
    request: JobRequest
    status: str = "queued"
    progress: int = 0
    stage: str | None = "Queued"
    error_code: str | None = None
    error_message: str | None = None
    results: dict[str, Any] | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: dict[str, JobState] = {}
        self._by_job_id: dict[str, str] = {}
        self._pool = ThreadPoolExecutor(max_workers=settings.max_workers)
        self._guard = threading.Lock()

    def submit(self, request: JobRequest) -> JobState:
        with self._guard:
            existing = self._by_job_id.get(request.jobId)
            if existing:
                return self._jobs[existing]
            external_id = f"cv-{uuid.uuid4().hex[:16]}"
            state = JobState(external_id=external_id, request=request)
            self._jobs[external_id] = state
            self._by_job_id[request.jobId] = external_id
        self._pool.submit(self._run, state)
        return state

    def get(self, external_id: str) -> JobState | None:
        return self._jobs.get(external_id)

    def cancel(self, external_id: str) -> None:
        state = self._jobs.get(external_id)
        if state and state.status not in {"ready_for_review", "failed"}:
            state.status = "cancelled"
            state.stage = "Cancelled"

    def _run(self, state: JobState) -> None:
        def progress(status: str, stage: str, percent: int) -> None:
            if state.status == "cancelled":
                raise RuntimeError("cancelled")
            state.status = status
            state.stage = stage
            state.progress = max(state.progress, min(99, percent))

        try:
            state.status = "preparing_video"
            results = run_job(state.request, progress)
            state.results = results
            needs = results["summary"].get("needs_confirmation", 0)
            total = max(1, results["summary"].get("tracks", 1))
            state.status = (
                "needs_confirmation" if needs and needs >= total else "ready_for_review"
            )
            state.stage = "Candidate clips created"
            state.progress = 100
        except Exception as error:  # noqa: BLE001
            if state.status == "cancelled":
                return
            state.status = "failed"
            message = str(error) or error.__class__.__name__
            state.error_code = (
                message if message in {"video_unavailable", "cancelled"} else "analysis_failed"
            )
            state.error_message = message
            state.stage = None
            traceback.print_exc()


registry = JobRegistry()
