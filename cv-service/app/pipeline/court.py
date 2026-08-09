"""Playing-area filtering and dead-time skipping.

Both are conservative: they only remove work when the evidence is strong, so
real player footage is never silently dropped from the analysis.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


def filter_playing_area(
    detections: list,
    frame_width: int,
    frame_height: int,
    top_exclude_fraction: float,
    min_height_fraction: float,
    max_height_fraction: float,
) -> tuple[list, int]:
    """Drop detections that cannot be on-court players (crowd, bench, artefacts)."""
    kept = []
    dropped = 0
    for detection in detections:
        x1, y1, x2, y2 = detection.box
        height_fraction = (y2 - y1) / max(1.0, float(frame_height))
        bottom_fraction = y2 / max(1.0, float(frame_height))
        if bottom_fraction < top_exclude_fraction:
            dropped += 1
            continue
        if height_fraction < min_height_fraction or height_fraction > max_height_fraction:
            dropped += 1
            continue
        width = x2 - x1
        if width <= 1 or (y2 - y1) / max(1.0, width) < 0.8:
            # Wider than tall: crowd blobs and scoreboard artefacts, not a player.
            dropped += 1
            continue
        kept.append(detection)
    return kept, dropped


@dataclass
class DeadTimeDetector:
    """Skips frames that are clearly not live play.

    Two independent signals, both required to be confident before skipping:
      * motion energy — frozen replays, graphics and timeout stills barely move
      * scene similarity — a learned "court look" histogram; close-ups, ad
        boards and studio cutaways score far away from it
    """

    motion_threshold: float = 1.2
    scene_threshold: float = 0.28
    _previous: np.ndarray | None = None
    _court: np.ndarray | None = None
    _court_samples: int = 0
    skipped_static: int = 0
    skipped_scene: int = 0
    learned_frames: int = 0
    history: list[tuple[float, float]] = field(default_factory=list)

    @staticmethod
    def _small(frame: np.ndarray) -> np.ndarray:
        return cv2.cvtColor(cv2.resize(frame, (96, 54)), cv2.COLOR_BGR2GRAY)

    @staticmethod
    def _hist(frame: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(cv2.resize(frame, (128, 72)), cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [16, 16], [0, 180, 0, 256])
        return cv2.normalize(hist, hist).flatten().astype(np.float32)

    def learn_court(self, frame: np.ndarray) -> None:
        """Called on frames where players were actually found — that is court."""
        hist = self._hist(frame)
        if self._court is None:
            self._court = hist
        else:
            weight = 1.0 / min(60.0, self._court_samples + 2.0)
            self._court = (1.0 - weight) * self._court + weight * hist
        self._court_samples += 1
        self.learned_frames += 1

    def should_skip(self, frame: np.ndarray) -> tuple[bool, str | None]:
        small = self._small(frame)
        motion = 999.0
        if self._previous is not None:
            motion = float(np.mean(cv2.absdiff(small, self._previous)))
        self._previous = small

        scene = 1.0
        if self._court is not None and self._court_samples >= 12:
            scene = float(
                cv2.compareHist(
                    self._court.reshape(16, 16), self._hist(frame).reshape(16, 16), cv2.HISTCMP_CORREL
                )
            )
        if len(self.history) < 5000:
            self.history.append((round(motion, 2), round(scene, 3)))

        if motion < self.motion_threshold:
            self.skipped_static += 1
            return True, "static_frame"
        if self._court is not None and self._court_samples >= 12 and scene < self.scene_threshold:
            self.skipped_scene += 1
            return True, "off_court_scene"
        return False, None
