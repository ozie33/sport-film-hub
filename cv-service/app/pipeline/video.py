"""Temporary, authorized video retrieval and frame decoding.

Downloaded film is temporary by contract: it is written into a per-job
directory and deleted as soon as processing finishes or fails. The CV service
is never long-term film storage.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from urllib.parse import urlparse
from dataclasses import dataclass
from typing import Iterator

import cv2
import httpx
import numpy as np

from app.config import settings
from app.logging_setup import get_logger, safe_source

log = get_logger("cv.video")

CHUNK = 1024 * 1024 * 4

# Containers ffmpeg/OpenCV pick the right demuxer for straight from the
# filename. WebM/MKV film is decoded natively; only a source that refuses to
# open is normalized (see normalize_for_analysis).
KNOWN_EXTENSIONS = (".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi")


def _source_extension(url: str, content_type: str | None) -> str:
    name = os.path.basename(urlparse(url).path).lower()
    for extension in KNOWN_EXTENSIONS:
        if name.endswith(extension):
            return extension
    mapping = {
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "video/x-m4v": ".m4v",
        "video/x-matroska": ".mkv",
        "video/mp4": ".mp4",
    }
    return mapping.get((content_type or "").split(";")[0].strip().lower(), ".mp4")


@dataclass
class TempVideo:
    path: str
    directory: str

    def cleanup(self) -> None:
        existed = os.path.isdir(self.directory)
        shutil.rmtree(self.directory, ignore_errors=True)
        if existed:
            log.info("temp file deleted dir=%s", self.directory)


def fetch_video(job_id: str, url: str) -> TempVideo:
    """Stream an authorized URL to a temporary file (supports range servers)."""
    directory = os.path.join(settings.work_dir, job_id)
    os.makedirs(directory, exist_ok=True)
    log.info("source download started job=%s source=%s", job_id, safe_source(url))
    with httpx.stream("GET", url, follow_redirects=True, timeout=120.0) as response:
        response.raise_for_status()
        path = os.path.join(
            directory,
            "source" + _source_extension(url, response.headers.get("content-type")),
        )
        with open(path, "wb") as handle:
            for chunk in response.iter_bytes(CHUNK):
                handle.write(chunk)
    size = os.path.getsize(path)
    if size == 0:
        log.error("source download produced empty file job=%s", job_id)
        raise RuntimeError("video_unavailable")
    log.info("source download completed job=%s bytes=%d", job_id, size)
    return TempVideo(path=path, directory=directory)


def normalize_for_analysis(job_id: str, path: str) -> str:
    """Transcode a container the decoder can't open into MP4, in place of rejecting it.

    The copy lives in the same per-job temp directory, so it is deleted together
    with the download when the job finishes or fails — nothing is duplicated
    permanently. No trimming or timestamp rewriting happens: the output keeps
    the original timeline, so every event timestamp still refers to the source.
    """
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("video_unavailable")
    target = os.path.join(os.path.dirname(path), "normalized.mp4")
    log.info("normalizing source for analysis job=%s", job_id)
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            path,
            "-map",
            "0:v:0",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "26",
            "-copyts",
            "-start_at_zero",
            target,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not os.path.exists(target) or os.path.getsize(target) == 0:
        log.error("normalization failed job=%s stderr=%s", job_id, (result.stderr or "")[:400])
        raise RuntimeError("video_unavailable")
    log.info("normalization completed job=%s bytes=%d", job_id, os.path.getsize(target))
    return target


@dataclass
class VideoInfo:
    fps: float
    frame_count: int
    duration: float
    width: int
    height: int


def probe(path: str) -> VideoInfo:
    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise RuntimeError("video_unavailable")
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    capture.release()
    duration = frames / fps if fps and frames else 0.0
    return VideoInfo(fps=fps, frame_count=frames, duration=duration, width=width, height=height)


def iter_frames(path: str, analysis_fps: float, max_frames: int) -> Iterator[tuple[float, np.ndarray]]:
    """Yield (timestamp_seconds, frame) sampled at the requested analysis FPS.

    Timestamps always refer to the original video timeline.
    """
    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise RuntimeError("video_unavailable")
    source_fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(source_fps / max(0.5, analysis_fps))))
    index = 0
    emitted = 0
    try:
        while emitted < max_frames:
            ok = capture.grab()
            if not ok:
                break
            if index % step == 0:
                ok, frame = capture.retrieve()
                if ok and frame is not None:
                    yield index / source_fps, frame
                    emitted += 1
            index += 1
    finally:
        capture.release()


def resize_for_detection(frame: np.ndarray, target_width: int) -> tuple[np.ndarray, float]:
    height, width = frame.shape[:2]
    if width <= target_width:
        return frame, 1.0
    scale = target_width / width
    resized = cv2.resize(frame, (target_width, int(height * scale)), interpolation=cv2.INTER_AREA)
    return resized, scale
