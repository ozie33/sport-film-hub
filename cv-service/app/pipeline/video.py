"""Temporary, authorized video retrieval and frame decoding.

Downloaded film is temporary by contract: it is written into a per-job
directory and deleted as soon as processing finishes or fails. The CV service
is never long-term film storage.
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from typing import Iterator

import cv2
import httpx
import numpy as np

from app.config import settings

CHUNK = 1024 * 1024 * 4


@dataclass
class TempVideo:
    path: str
    directory: str

    def cleanup(self) -> None:
        shutil.rmtree(self.directory, ignore_errors=True)


def fetch_video(job_id: str, url: str) -> TempVideo:
    """Stream an authorized URL to a temporary file (supports range servers)."""
    directory = os.path.join(settings.work_dir, job_id)
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, "source.mp4")
    with httpx.stream("GET", url, follow_redirects=True, timeout=120.0) as response:
        response.raise_for_status()
        with open(path, "wb") as handle:
            for chunk in response.iter_bytes(CHUNK):
                handle.write(chunk)
    if os.path.getsize(path) == 0:
        raise RuntimeError("video_unavailable")
    return TempVideo(path=path, directory=directory)


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
