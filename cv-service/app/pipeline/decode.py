"""ffmpeg-based sampled decoding.

OpenCV's `grab()` loop walks every frame of the source, which dominated wall
clock on long game film. ffmpeg does the sampling and scaling itself and hands
us only the frames we intend to analyse, as raw BGR24.

Timestamps always refer to the ORIGINAL video timeline, regardless of the
sampling rate used for analysis.
"""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from typing import Iterator

import numpy as np

from app.logging_setup import get_logger

log = get_logger("cv.decode")


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


@dataclass
class DecodeSpec:
    fps: float
    width: int
    height: int


def _even(value: int) -> int:
    return value if value % 2 == 0 else value + 1


def target_size(source_width: int, source_height: int, target_width: int) -> tuple[int, int]:
    if source_width <= 0 or source_height <= 0:
        return target_width, _even(int(target_width * 9 / 16))
    if source_width <= target_width:
        return _even(source_width), _even(source_height)
    scale = target_width / source_width
    return _even(target_width), _even(int(round(source_height * scale)))


def iter_frames(
    path: str,
    analysis_fps: float,
    source_width: int,
    source_height: int,
    target_width: int,
    start_seconds: float = 0.0,
) -> Iterator[tuple[float, np.ndarray]]:
    """Yield (original_timestamp_seconds, BGR frame) sampled at analysis_fps."""
    width, height = target_size(source_width, source_height, target_width)
    fps = max(0.1, analysis_fps)
    command = [
        "ffmpeg",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
    ]
    if start_seconds > 0:
        command += ["-ss", f"{start_seconds:.3f}"]
    command += [
        "-i",
        path,
        "-an",
        "-sn",
        "-vf",
        f"fps={fps},scale={width}:{height}",
        "-pix_fmt",
        "bgr24",
        "-f",
        "rawvideo",
        "-",
    ]
    frame_bytes = width * height * 3
    process = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=frame_bytes * 4
    )
    index = 0
    try:
        assert process.stdout is not None
        while True:
            payload = process.stdout.read(frame_bytes)
            if not payload or len(payload) < frame_bytes:
                break
            frame = np.frombuffer(payload, dtype=np.uint8).reshape(height, width, 3)
            yield start_seconds + index / fps, frame
            index += 1
    finally:
        try:
            if process.stdout:
                process.stdout.close()
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
