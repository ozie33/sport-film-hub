"""Job orchestration: download -> detect -> track -> identify -> candidates."""

from __future__ import annotations

import base64
import time
from typing import Callable

import cv2
import httpx
import numpy as np

from app.config import (
    PERSON_DETECTOR_VERSION,
    REID_VERSION,
    SERVICE_VERSION,
    TRACKER_VERSION,
    settings,
)
from app.logging_setup import get_logger
from app.models import JobRequest

log = get_logger("cv.pipeline")
from app.pipeline import video as video_io
from app.pipeline.candidates import TargetSample, build_candidates
from app.pipeline.detector import PersonDetector, Detection
from app.pipeline.identify import (
    IdentityState,
    choose_target,
    match_confirmation,
    normalized_box_to_pixels,
)
from app.pipeline.reid import (
    ReferenceGallery,
    bgr_to_hex,
    hex_to_bgr,
    region_means,
    signature,
)

_detector: PersonDetector | None = None


def detector() -> PersonDetector:
    global _detector
    if _detector is None:
        _detector = PersonDetector()
    return _detector


Progress = Callable[[str, str, int], None]


def _load_reference_signatures(references) -> ReferenceGallery:
    """Fetch authorized reference images and turn them into appearance vectors."""
    gallery = ReferenceGallery()
    for reference in references:
        if reference.kind == "reference_video":
            continue
        try:
            response = httpx.get(reference.url, follow_redirects=True, timeout=30.0)
            response.raise_for_status()
            buffer = np.frombuffer(response.content, dtype=np.uint8)
            image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
            if image is None:
                continue
            height, width = image.shape[:2]
            gallery.add(signature(image, (0, 0, width, height)), reference.trust)
        except Exception:
            # A single unreachable reference must not fail the whole job.
            continue
    return gallery


def _encode_debug_frame(frame: np.ndarray, box, label: str) -> str:
    annotated = frame.copy()
    x1, y1, x2, y2 = (int(v) for v in box)
    cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 200, 255), 2)
    cv2.putText(
        annotated, label, (x1, max(16, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 1
    )
    annotated, _ = video_io.resize_for_detection(annotated, 640)
    ok, encoded = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode()


def run_job(request: JobRequest, progress: Progress) -> dict:
    started = time.time()
    job_settings = request.settings

    if not request.video.url:
        raise RuntimeError("video_unavailable")

    log.info("job processing started job=%s", request.jobId)
    progress("preparing_video", "Retrieving authorized film", 5)
    temp = video_io.fetch_video(request.jobId, request.video.url)

    try:
        info = video_io.probe(temp.path)
        duration = request.video.durationSeconds or info.duration
        log.info(
            "video probed job=%s source_fps=%.2f frames=%d resolution=%dx%d duration=%.1fs",
            request.jobId,
            info.fps,
            info.frame_count,
            info.width,
            info.height,
            duration or 0.0,
        )
        progress("identifying_player", "Loading reference media", 12)
        gallery = _load_reference_signatures(request.references)
        log.info(
            "reference media loaded job=%s images=%d confirmed=%d",
            request.jobId,
            len(gallery.high) + len(gallery.medium) + len(gallery.low),
            len(gallery.high),
        )
        log.info(
            "inference started job=%s device=%s analysis_fps=%.2f detection_resolution=%d",
            request.jobId,
            detector().device.type,
            job_settings.analysisFps,
            job_settings.detectionResolution,
        )

        confirmations = sorted(
            request.identityContext.confirmations, key=lambda item: item.timestamp
        )
        pending_confirmations = list(confirmations)

        uniform_primary = hex_to_bgr(request.identityContext.uniformPrimaryColor)
        uniform_secondary = hex_to_bgr(request.identityContext.uniformSecondaryColor)
        # Appearance learned from the user's confirmed game frames. When no
        # uniform colours were supplied manually, these replace them.
        confirmed_torso: list[np.ndarray] = []
        confirmed_legs: list[np.ndarray] = []

        from app.pipeline.tracker import MultiObjectTracker

        tracker = MultiObjectTracker()
        state = IdentityState()
        target_samples: list[TargetSample] = []
        debug_frames: list[dict] = []

        detections_total = 0
        frames_processed = 0
        ball_frames = 0
        target_frames = 0
        confirmation_matches = 0

        expected_frames = (
            min(settings.max_frames, int(max(1.0, duration) * job_settings.analysisFps))
            if duration
            else settings.max_frames
        )

        for timestamp, raw_frame in video_io.iter_frames(
            temp.path, job_settings.analysisFps, settings.max_frames
        ):
            frame, scale = video_io.resize_for_detection(
                raw_frame, job_settings.detectionResolution
            )
            detections: list[Detection] = detector().detect(
                frame,
                timestamp,
                job_settings.detectionConfidence,
                job_settings.ballDetection,
            )
            people = [d for d in detections if d.label == "person"]
            balls = [d for d in detections if d.label == "ball"]
            detections_total += len(people)
            if balls:
                ball_frames += 1

            observations_input = [
                (d.box, d.confidence, signature(frame, d.box)) for d in people
            ]
            updated = tracker.update(timestamp, observations_input)
            observations = [
                (track, box, signature(frame, box)) for track, box in updated
            ]

            # Anchor identity on user-confirmed frames as they are reached.
            while pending_confirmations and pending_confirmations[0].timestamp <= timestamp + (
                1.0 / max(0.5, job_settings.analysisFps)
            ):
                confirmation = pending_confirmations.pop(0)
                target_box = normalized_box_to_pixels(
                    confirmation.boundingBox, frame.shape[1], frame.shape[0]
                )
                if target_box is None:
                    continue
                matched = match_confirmation(observations, target_box)
                if matched is not None:
                    track, sig = matched
                    gallery.add(sig, "high")
                    state.target_track_id = track.track_id
                    state.target_signature = sig
                    confirmation_matches += 1
                    torso_mean, legs_mean = region_means(frame, target_box)
                    if torso_mean is not None:
                        confirmed_torso.append(torso_mean)
                    if legs_mean is not None:
                        confirmed_legs.append(legs_mean)
                    if uniform_primary is None and confirmed_torso:
                        uniform_primary = np.mean(confirmed_torso, axis=0).astype(np.float32)
                    if uniform_secondary is None and confirmed_legs:
                        uniform_secondary = np.mean(confirmed_legs, axis=0).astype(np.float32)

            chosen = choose_target(
                frame,
                observations,
                gallery,
                state,
                uniform_primary,
                uniform_secondary,
                timestamp,
                job_settings.confirmationThreshold,
            )

            if chosen is not None:
                track, score = chosen
                box = track.points[-1].box
                target_frames += 1
                ball_distance = None
                if balls:
                    cx = (box[0] + box[2]) / 2
                    cy = (box[1] + box[3]) / 2
                    ball_distance = min(
                        float(
                            np.hypot(
                                ((b.box[0] + b.box[2]) / 2 - cx) / max(1, frame.shape[1]),
                                ((b.box[1] + b.box[3]) / 2 - cy) / max(1, frame.shape[1]),
                            )
                        )
                        for b in balls
                    )
                target_samples.append(
                    TargetSample(
                        timestamp=timestamp,
                        box=box,
                        identity_confidence=score,
                        ball_distance=ball_distance,
                    )
                )
                if len(debug_frames) < settings.debug_frames and frames_processed % 25 == 0:
                    image = _encode_debug_frame(
                        frame, box, f"{track.track_id} {score:.2f}"
                    )
                    if image:
                        debug_frames.append(
                            {
                                "timestamp": round(timestamp, 2),
                                "imageBase64": image,
                                "boxes": [
                                    {
                                        "trackId": track.track_id,
                                        "isTarget": True,
                                        "detectionConfidence": round(
                                            track.points[-1].detection_confidence, 3
                                        ),
                                        "identityConfidence": round(score, 3),
                                        "box": {
                                            "x": round(box[0] / max(1, frame.shape[1]), 4),
                                            "y": round(box[1] / max(1, frame.shape[0]), 4),
                                            "w": round(
                                                (box[2] - box[0]) / max(1, frame.shape[1]), 4
                                            ),
                                            "h": round(
                                                (box[3] - box[1]) / max(1, frame.shape[0]), 4
                                            ),
                                        },
                                    }
                                ],
                            }
                        )

            frames_processed += 1
            if frames_processed % 10 == 0:
                ratio = min(0.92, frames_processed / max(1, expected_frames))
                if ratio < 0.35:
                    progress("identifying_player", "Identifying player", int(12 + ratio * 60))
                else:
                    progress("tracking_player", "Tracking player", int(12 + ratio * 60))

        log.info(
            "frames decoded job=%s frames=%d", request.jobId, frames_processed
        )
        log.info(
            "inference completed job=%s person_detections=%d ball_frames=%d",
            request.jobId,
            detections_total,
            ball_frames,
        )
        log.info(
            "tracking completed job=%s tracks=%d target_frames=%d target_track=%s",
            request.jobId,
            len(tracker.tracks),
            target_frames,
            state.target_track_id,
        )
        progress("generating_candidates", "Finding player involvement", 88)

        tracks_payload = []
        for track in tracker.tracks:
            if len(track.points) < 2:
                continue
            identity_confidence = state.identity_confidence(track.track_id)
            tracking_confidence = track.tracking_confidence
            tracks_payload.append(
                {
                    "trackId": track.track_id,
                    "startTime": round(track.start_time, 3),
                    "endTime": round(track.end_time, 3),
                    "averageConfidence": round((identity_confidence + tracking_confidence) / 2, 3),
                    "identityConfidence": round(identity_confidence, 3),
                    "trackingConfidence": round(tracking_confidence, 3),
                    "needsConfirmation": tracking_confidence < job_settings.confirmationThreshold
                    or identity_confidence < job_settings.identityMediumThreshold,
                    "isTarget": track.track_id == state.target_track_id,
                    "metadata": {
                        "detection_confidence": round(track.detection_confidence, 3),
                        "samples": len(track.points),
                        "boxes": track.box_history(),
                        "signals": [
                            "person_detection",
                            "iou_association",
                            "appearance_similarity",
                            "uniform_colors",
                        ],
                    },
                }
            )

        candidates = build_candidates(
            target_samples,
            job_settings.preRoll,
            job_settings.postRoll,
            duration or 0.0,
            max(0.35, job_settings.identityMediumThreshold * 0.8),
        )
        for candidate in candidates:
            candidate["trackId"] = state.target_track_id or (
                tracks_payload[0]["trackId"] if tracks_payload else "t1"
            )

        analyzed_span = (
            target_samples[-1].timestamp - target_samples[0].timestamp if target_samples else 0.0
        )
        coverage = (
            round(min(1.0, target_frames / max(1, frames_processed)), 4) if frames_processed else 0.0
        )
        identity_scores = [sample.identity_confidence for sample in target_samples]

        return {
            "modelVersion": SERVICE_VERSION,
            "modelVersions": {
                "serviceVersion": SERVICE_VERSION,
                "personDetectorVersion": PERSON_DETECTOR_VERSION,
                "trackerVersion": TRACKER_VERSION,
                "reidentificationVersion": REID_VERSION,
            },
            "tracks": tracks_payload,
            "candidates": candidates,
            "needsConfirmation": state.needs_confirmation[:20],
            "debugFrames": debug_frames,
            "metrics": {
                "videoDurationSeconds": round(duration or 0.0, 2),
                "sourceFps": round(info.fps, 2),
                "analysisFps": job_settings.analysisFps,
                "framesAnalyzed": frames_processed,
                "detectionResolution": job_settings.detectionResolution,
                "detections": detections_total,
                "detectionsPerFrame": round(detections_total / max(1, frames_processed), 2),
                "tracks": len(tracks_payload),
                "tracksCreated": len(tracker.tracks),
                "framesWithTarget": target_frames,
                "targetTrackingCoverage": coverage,
                "targetVisibleSeconds": round(analyzed_span, 2),
                "targetTrackChanges": state.switches,
                "lowConfidenceIntervals": state.low_confidence_intervals,
                "confirmationsRequested": len(state.needs_confirmation),
                "confirmationsSupplied": len(confirmations),
                "confirmationsMatched": confirmation_matches,
                "referenceImagesUsed": len(gallery.high) + len(gallery.medium) + len(gallery.low),
                "confirmedReferencesUsed": len(gallery.high),
                "ballDetectedFrames": ball_frames,
                "meanIdentityConfidence": round(float(np.mean(identity_scores)), 3)
                if identity_scores
                else 0.0,
                "candidateClips": len(candidates),
                "analysisDurationSeconds": round(time.time() - started, 2),
                "processingSeconds": round(time.time() - started, 2),
            },
            "summary": {
                "tracks": len(tracks_payload),
                "candidates": len(candidates),
                "needs_confirmation": sum(
                    1 for track in tracks_payload if track["needsConfirmation"]
                ),
                "target_track_id": state.target_track_id,
            },
        }
    finally:
        # Temporary film is always removed, success or failure.
        temp.cleanup()
