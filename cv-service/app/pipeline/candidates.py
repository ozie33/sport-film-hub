"""Player-involvement segmentation.

Phase 3C produces CANDIDATE involvement segments only. Basketball semantics
(shots, assists, rebounds, turnovers) are explicitly out of scope.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class TargetSample:
    timestamp: float
    box: tuple[float, float, float, float]
    identity_confidence: float
    ball_distance: float | None  # normalized by frame width, None when no ball


def _centre(box: tuple[float, float, float, float]) -> tuple[float, float]:
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)


def build_candidates(
    samples: list[TargetSample],
    pre_roll: float,
    post_roll: float,
    duration: float,
    min_confidence: float,
    gap_limit: float = 2.5,
    min_segment_seconds: float = 0.6,
) -> list[dict]:
    """Group consecutive high-involvement samples into candidate windows."""
    # Phase 3G: short but valid target segments are real involvement on 240p
    # film, so two samples are enough to form a candidate window.
    if len(samples) < 2:
        return []

    speeds: list[float] = [0.0]
    for index in range(1, len(samples)):
        previous, current = samples[index - 1], samples[index]
        dt = max(1e-3, current.timestamp - previous.timestamp)
        px, py = _centre(previous.box)
        cx, cy = _centre(current.box)
        speeds.append(float(np.hypot(cx - px, cy - py) / dt))

    speed_reference = float(np.percentile(speeds, 75)) or 1.0
    involved: list[tuple[int, float, str]] = []

    for index, sample in enumerate(samples):
        motion = min(1.0, speeds[index] / max(1e-6, speed_reference))
        ball = 0.0
        reason = "player_near_play"
        if sample.ball_distance is not None:
            ball = max(0.0, 1.0 - min(1.0, sample.ball_distance / 0.25))
            if ball > 0.7:
                reason = "player_has_ball"
            elif ball > 0.35:
                reason = "player_receives_ball"
        if reason == "player_near_play" and motion > 0.8:
            reason = "player_transition_involvement"

        score = 0.55 * max(motion, ball) + 0.45 * sample.identity_confidence
        if score >= min_confidence:
            involved.append((index, score, reason))

    if not involved:
        return []

    candidates: list[dict] = []
    group: list[tuple[int, float, str]] = [involved[0]]
    gap_limit = max(0.5, gap_limit)

    def flush(current: list[tuple[int, float, str]]) -> None:
        if not current:
            return
        first = samples[current[0][0]]
        last = samples[current[-1][0]]
        if last.timestamp - first.timestamp < max(0.0, min_segment_seconds):
            return
        scores = [item[1] for item in current]
        reasons = [item[2] for item in current]
        reason = max(set(reasons), key=reasons.count)
        # Exact original timestamps are preserved alongside padded output.
        original_start = round(first.timestamp, 3)
        original_end = round(last.timestamp, 3)
        candidates.append(
            {
                "trackId": "",  # filled by the caller with the target track id
                "startTime": round(max(0.0, original_start - pre_roll), 3),
                "endTime": round(min(duration or original_end + post_roll, original_end + post_roll), 3),
                "originalStartTime": original_start,
                "originalEndTime": original_end,
                "confidence": round(float(np.mean(scores)), 3),
                "reason": reason,
                "prediction": {
                    "involvement_window": {"start": original_start, "end": original_end},
                    "pre_roll": pre_roll,
                    "post_roll": post_roll,
                    "samples": len(current),
                    "mean_identity_confidence": round(
                        float(np.mean([samples[i].identity_confidence for i, _, _ in current])), 3
                    ),
                    "signals_used": [
                        "tracking_continuity",
                        "appearance_similarity",
                        "uniform_colors",
                        "ball_proximity",
                    ],
                },
            }
        )

    for item in involved[1:]:
        previous_index = group[-1][0]
        if samples[item[0]].timestamp - samples[previous_index].timestamp <= gap_limit:
            group.append(item)
        else:
            flush(group)
            group = [item]
    flush(group)
    return candidates
