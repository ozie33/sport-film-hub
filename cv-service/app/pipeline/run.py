"""Job orchestration: download -> sampled decode -> batched detect -> track ->
event-driven re-identification -> candidate involvement segments.

Performance contract (Phase 3C optimisation):
  * ffmpeg does the sampling/scaling, so we never walk every source frame
  * the detector runs batched fp16 on GPU, periodically rather than per frame
  * a cheap motion tracker fills the frames between detections
  * re-identification is event driven, not per frame
  * the FULL video is analysed; a wall-clock job budget is the only safety
    limit, and any truncation is reported explicitly
  * clip timestamps are always original-video timestamps
"""

from __future__ import annotations

import base64
import time
from typing import Callable

import cv2
import httpx
import numpy as np

from app.config import (
    REID_VERSION,
    SERVICE_VERSION,
    TRACKER_VERSION,
    settings,
)
from app.logging_setup import get_logger
from app.models import JobRequest
from app.pipeline import decode as decode_io
from app.pipeline import video as video_io
from app.pipeline.candidates import TargetSample, build_candidates
from app.pipeline.court import DeadTimeDetector, filter_playing_area
from app.pipeline.detector import Detection, PersonDetector
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
from app.pipeline.timing import StageTimer, gpu_stats
from app.pipeline.tracker import MultiObjectTracker

log = get_logger("cv.pipeline")

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
        except Exception:  # noqa: BLE001
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
    timer = StageTimer()
    job_settings = request.settings

    if not request.video.url:
        raise RuntimeError("video_unavailable")

    log.info("job processing started job=%s", request.jobId)
    progress("preparing_video", "Retrieving authorized film", 5)
    with timer.stage("download"):
        temp = video_io.fetch_video(request.jobId, request.video.url)

    try:
        with timer.stage("probe"):
            info = video_io.probe(temp.path)
        duration = float(request.video.durationSeconds or info.duration or 0.0)
        analysis_fps = max(0.25, float(job_settings.analysisFps))
        batch_size = max(1, settings.batch_size)
        detect_every = max(1, settings.detect_every)

        log.info(
            "video probed job=%s source_fps=%.2f frames=%d resolution=%dx%d duration=%.1fs",
            request.jobId,
            info.fps,
            info.frame_count,
            info.width,
            info.height,
            duration,
        )

        progress("identifying_player", "Loading reference media", 12)
        with timer.stage("references"):
            gallery = _load_reference_signatures(request.references)
        log.info(
            "reference media loaded job=%s images=%d confirmed=%d",
            request.jobId,
            len(gallery.high) + len(gallery.medium) + len(gallery.low),
            len(gallery.high),
        )

        active_detector = detector()
        log.info(
            "inference started job=%s backend=%s device=%s fp16=%s analysis_fps=%.2f "
            "detection_resolution=%d batch=%d detect_every=%d reid_interval=%.1fs budget=%.0fs "
            "frame_cap=%s",
            request.jobId,
            active_detector.backend,
            active_detector.device.type,
            active_detector.half,
            analysis_fps,
            job_settings.detectionResolution,
            batch_size,
            detect_every,
            settings.reid_interval_seconds,
            settings.job_budget_seconds,
            settings.max_frames or "none",
        )
        log.info("gpu job=%s %s", request.jobId, gpu_stats())

        confirmations = sorted(
            request.identityContext.confirmations, key=lambda item: item.timestamp
        )
        pending_confirmations = list(confirmations)

        uniform_primary = hex_to_bgr(request.identityContext.uniformPrimaryColor)
        uniform_secondary = hex_to_bgr(request.identityContext.uniformSecondaryColor)
        confirmed_torso: list[np.ndarray] = []
        confirmed_legs: list[np.ndarray] = []

        tracker = MultiObjectTracker()
        state = IdentityState()
        dead_time = DeadTimeDetector(
            motion_threshold=settings.dead_time_motion,
            scene_threshold=settings.dead_time_scene,
        )
        target_samples: list[TargetSample] = []
        debug_frames: list[dict] = []

        detections_total = 0
        detections_dropped = 0
        frames_decoded = 0
        frames_detected = 0
        frames_propagated = 0
        frames_dead_time = 0
        ball_frames = 0
        target_frames = 0
        confirmation_matches = 0
        signature_computations = 0
        last_timestamp = 0.0
        last_reid_time = -1e9
        previous_person_count = -1
        truncated_reason: str | None = None
        adaptive_stride = 1

        # -------------------------------------------------------------- helpers

        def emit_progress(timestamp: float) -> None:
            if duration <= 0:
                return
            ratio = max(0.0, min(1.0, timestamp / duration))
            percent = int(12 + ratio * 76)  # linear 12% -> 88%
            stage = (
                "identifying_player"
                if confirmation_matches == 0 and ratio < 0.08
                else "tracking_player"
            )
            label = (
                "Identifying player"
                if stage == "identifying_player"
                else f"Tracking player · {int(ratio * 100)}% of film"
            )
            progress(stage, label, percent)

        def handle_detect_frame(timestamp: float, frame: np.ndarray, detections: list[Detection]):
            nonlocal detections_total, detections_dropped, ball_frames, target_frames
            nonlocal confirmation_matches, signature_computations, previous_person_count
            nonlocal last_reid_time, uniform_primary, uniform_secondary

            people = [d for d in detections if d.label == "person"]
            balls = [d for d in detections if d.label == "ball"]
            if settings.court_filter:
                people, dropped = filter_playing_area(
                    people,
                    frame.shape[1],
                    frame.shape[0],
                    settings.court_top_exclude,
                    settings.court_min_height,
                    settings.court_max_height,
                )
                detections_dropped += dropped
            detections_total += len(people)
            if balls:
                ball_frames += 1
            if people:
                dead_time.learn_court(frame)

            # Decide up front whether appearance work is needed on this frame.
            cadence_due = timestamp - last_reid_time >= settings.reid_interval_seconds
            count_changed = len(people) != previous_person_count
            target_missing = state.target_track_id is None
            low_confidence = (
                state.cached_scores.get(state.target_track_id or "", 1.0)
                < job_settings.confirmationThreshold + 0.1
            )
            confirmation_due = bool(
                pending_confirmations
                and pending_confirmations[0].timestamp <= timestamp + (1.0 / analysis_fps)
            )
            want_signatures = (
                cadence_due or count_changed or target_missing or low_confidence or confirmation_due
            )
            previous_person_count = len(people)

            # One signature per detection, computed at most once and reused.
            with timer.stage("signature"):
                signatures: list[np.ndarray | None] = []
                for detection in people:
                    if want_signatures:
                        signatures.append(signature(frame, detection.box))
                        signature_computations += 1
                    else:
                        signatures.append(None)

            with timer.stage("track"):
                updated = tracker.update(
                    timestamp,
                    [
                        (detection.box, detection.confidence, sig)
                        for detection, sig in zip(people, signatures)
                    ],
                )

            # Event-driven re-ID: new tracks, reappearance after occlusion,
            # ambiguity/low confidence, or the periodic cadence.
            event_ids = set(tracker.last_new_track_ids) | set(tracker.reappeared_track_ids)
            reid_all = cadence_due or target_missing or low_confidence or confirmation_due
            if reid_all:
                state.note_reid(
                    "cadence"
                    if cadence_due
                    else "target_missing"
                    if target_missing
                    else "confirmation"
                    if confirmation_due
                    else "low_confidence"
                )
            for _ in event_ids:
                state.note_reid("new_or_reappeared_track")

            need_signatures_now = bool(event_ids) or reid_all
            if need_signatures_now and not want_signatures:
                with timer.stage("signature"):
                    signatures = [signature(frame, detection.box) for detection in people]
                    signature_computations += len(people)
                for (track, _box), sig in zip(updated, signatures):
                    if sig is not None and sig.size:
                        track.signatures.append(sig)

            observations = [
                (track, box, sig)
                for (track, box), sig in zip(updated, signatures)
            ]
            if reid_all or event_ids:
                last_reid_time = timestamp

            with timer.stage("confirmations"):
                while pending_confirmations and pending_confirmations[0].timestamp <= timestamp + (
                    1.0 / analysis_fps
                ):
                    confirmation = pending_confirmations.pop(0)
                    target_box = normalized_box_to_pixels(
                        confirmation.boundingBox, frame.shape[1], frame.shape[0]
                    )
                    if target_box is None:
                        continue
                    matched = match_confirmation(
                        [(t, b, s) for t, b, s in observations if s is not None], target_box
                    )
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

            with timer.stage("reid"):
                chosen = choose_target(
                    frame,
                    observations,
                    gallery,
                    state,
                    uniform_primary,
                    uniform_secondary,
                    timestamp,
                    job_settings.confirmationThreshold,
                    reid_track_ids=None if reid_all else event_ids,
                )

            if chosen is None:
                return
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
            if len(debug_frames) < settings.debug_frames and frames_detected % 40 == 0:
                image = _encode_debug_frame(frame, box, f"{track.track_id} {score:.2f}")
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
                                        "w": round((box[2] - box[0]) / max(1, frame.shape[1]), 4),
                                        "h": round((box[3] - box[1]) / max(1, frame.shape[0]), 4),
                                    },
                                }
                            ],
                        }
                    )

        def handle_tracked_frame(timestamp: float) -> None:
            """Motion-only step between detections (no detector, no re-ID)."""
            nonlocal frames_propagated, target_frames
            with timer.stage("track_between"):
                propagated = tracker.propagate(timestamp)
            frames_propagated += 1
            if not state.target_track_id:
                return
            for track, box in propagated:
                if track.track_id != state.target_track_id:
                    continue
                target_frames += 1
                target_samples.append(
                    TargetSample(
                        timestamp=timestamp,
                        box=box,
                        identity_confidence=state.cached_scores.get(track.track_id, 0.0),
                        ball_distance=None,
                    )
                )

        # ------------------------------------------------------------- main loop

        pending: list[tuple[str, float, np.ndarray | None]] = []

        def flush() -> None:
            nonlocal frames_detected
            if not pending:
                return
            detect_items = [item for item in pending if item[0] == "detect"]
            results: list[list[Detection]] = []
            if detect_items:
                with timer.stage("detect"):
                    results = active_detector.detect_batch(
                        [item[2] for item in detect_items],
                        [item[1] for item in detect_items],
                        job_settings.detectionConfidence,
                        job_settings.ballDetection,
                    )
            cursor = 0
            for kind, timestamp, frame in pending:
                if kind == "detect":
                    handle_detect_frame(timestamp, frame, results[cursor] if results else [])
                    cursor += 1
                    frames_detected += 1
                elif kind == "track":
                    handle_tracked_frame(timestamp)
            pending.clear()

        if decode_io.ffmpeg_available():
            decode_iterator = decode_io.iter_frames(
                temp.path,
                analysis_fps,
                info.width,
                info.height,
                job_settings.detectionResolution,
            )
        else:
            # Fallback only; ffmpeg is present in the production image.
            log.warning("ffmpeg missing job=%s falling back to OpenCV decode", request.jobId)
            decode_iterator = (
                (timestamp, video_io.resize_for_detection(frame, job_settings.detectionResolution)[0])
                for timestamp, frame in video_io.iter_frames(
                    temp.path, analysis_fps, settings.max_frames or 10**9
                )
            )
        decode_started = time.perf_counter()
        while True:
            with timer.stage("decode"):
                item = next(decode_iterator, None)
            if item is None:
                break
            timestamp, frame = item
            frames_decoded += 1
            last_timestamp = timestamp

            # Wall-clock safety limit. Never a silent frame cap.
            if timer.elapsed > settings.job_budget_seconds:
                truncated_reason = "wall_clock_budget"
                log.warning(
                    "job budget reached job=%s elapsed=%.0fs analysed_to=%.1fs of %.1fs",
                    request.jobId,
                    timer.elapsed,
                    timestamp,
                    duration,
                )
                break
            if settings.max_frames and frames_decoded > settings.max_frames:
                truncated_reason = "frame_cap"
                break

            is_dead = False
            if settings.dead_time_skip:
                with timer.stage("dead_time"):
                    is_dead, _reason = dead_time.should_skip(frame)
            if is_dead:
                frames_dead_time += 1
                pending.append(("dead", timestamp, None))
            elif frames_decoded % (detect_every * adaptive_stride) == 1 or detect_every == 1:
                pending.append(("detect", timestamp, frame))
            else:
                pending.append(("track", timestamp, None))

            if sum(1 for item in pending if item[0] == "detect") >= batch_size:
                flush()
                emit_progress(timestamp)
                # Adaptive pacing: keep the whole film inside the budget rather
                # than truncating it.
                if duration > 0 and timestamp > 30:
                    projected = timer.elapsed / max(1e-6, timestamp / duration)
                    if projected > settings.job_budget_seconds * 0.9 and adaptive_stride < 8:
                        adaptive_stride *= 2
                        log.warning(
                            "pacing behind budget job=%s projected=%.0fs stride=%d",
                            request.jobId,
                            projected,
                            adaptive_stride,
                        )
                if frames_decoded % (batch_size * 8) < batch_size:
                    log.info(
                        "progress job=%s t=%.1fs/%.1fs decoded=%d detected=%d tracked=%d "
                        "dead_time=%d tracks=%d fps_wall=%.2f stages[%s] gpu=%s",
                        request.jobId,
                        timestamp,
                        duration,
                        frames_decoded,
                        frames_detected,
                        frames_propagated,
                        frames_dead_time,
                        len(tracker.tracks),
                        frames_decoded / max(1e-6, time.perf_counter() - decode_started),
                        timer.summary(),
                        gpu_stats(),
                    )
        flush()

        analysed_seconds = last_timestamp
        coverage_fraction = round(min(1.0, analysed_seconds / duration), 4) if duration else 0.0
        log.info(
            "decode/analysis complete job=%s decoded=%d detected=%d tracked_between=%d "
            "dead_time_skipped=%d signatures=%d reid_evaluations=%d coverage=%.1f%% truncated=%s",
            request.jobId,
            frames_decoded,
            frames_detected,
            frames_propagated,
            frames_dead_time,
            signature_computations,
            state.reid_evaluations,
            coverage_fraction * 100,
            truncated_reason or "no",
        )
        log.info(
            "stage timings job=%s total=%.1fs %s per_call_ms=%s",
            request.jobId,
            timer.elapsed,
            timer.summary(),
            timer.per_call_ms(),
        )
        log.info(
            "tracking completed job=%s tracks=%d target_frames=%d target_track=%s",
            request.jobId,
            len(tracker.tracks),
            target_frames,
            state.target_track_id,
        )
        progress("generating_candidates", "Finding player involvement", 90)

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
                            "iou_motion_association",
                            "appearance_similarity",
                            "uniform_colors",
                        ],
                    },
                }
            )

        with timer.stage("candidates"):
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
        frames_analyzed = frames_detected + frames_propagated
        coverage = (
            round(min(1.0, target_frames / max(1, frames_analyzed)), 4) if frames_analyzed else 0.0
        )
        identity_scores = [sample.identity_confidence for sample in target_samples]

        return {
            "modelVersion": SERVICE_VERSION,
            "modelVersions": {
                "serviceVersion": SERVICE_VERSION,
                "personDetectorVersion": active_detector.version,
                "trackerVersion": TRACKER_VERSION,
                "reidentificationVersion": REID_VERSION,
            },
            "tracks": tracks_payload,
            "candidates": candidates,
            "needsConfirmation": state.needs_confirmation[:20],
            "debugFrames": debug_frames,
            "metrics": {
                "videoDurationSeconds": round(duration or 0.0, 2),
                "gameAppearance": {
                    "source": "confirmed_game_frames" if confirmed_torso else "manual_or_none",
                    "confirmedCropsUsed": len(confirmed_torso),
                    "uniformPrimaryColor": bgr_to_hex(uniform_primary),
                    "uniformSecondaryColor": bgr_to_hex(uniform_secondary),
                    "manualUniformSupplied": bool(
                        request.identityContext.uniformPrimaryColor
                        or request.identityContext.uniformSecondaryColor
                    ),
                    "jerseyNumberSupplied": bool(request.identityContext.jerseyNumber),
                },
                "detectorBackend": active_detector.backend,
                "detectorPrecision": "fp16" if active_detector.half else "fp32",
                "device": active_detector.device.type,
                "batchSize": batch_size,
                "detectEveryNthFrame": detect_every * adaptive_stride,
                "reidIntervalSeconds": settings.reid_interval_seconds,
                "sourceFps": round(info.fps, 2),
                "analysisFps": analysis_fps,
                "framesDecoded": frames_decoded,
                "framesAnalyzed": frames_analyzed,
                "framesDetected": frames_detected,
                "framesTrackedBetween": frames_propagated,
                "framesSkippedDeadTime": frames_dead_time,
                "deadTimeStaticFrames": dead_time.skipped_static,
                "deadTimeOffCourtFrames": dead_time.skipped_scene,
                "detectionsDroppedOffCourt": detections_dropped,
                "signatureComputations": signature_computations,
                "reidEvaluations": state.reid_evaluations,
                "reidTriggers": state.reid_reasons,
                "analyzedSeconds": round(analysed_seconds, 2),
                "analyzedCoverageFraction": coverage_fraction,
                "analyzedCoveragePercent": round(coverage_fraction * 100, 1),
                "fullVideoAnalyzed": truncated_reason is None,
                "truncationReason": truncated_reason,
                "jobBudgetSeconds": settings.job_budget_seconds,
                "stageSecondsTotal": {
                    name: round(value / 1000.0, 2) for name, value in timer.totals_ms().items()
                },
                "stageMillisecondsPerCall": timer.per_call_ms(),
                "gpu": gpu_stats(),
                "detectionResolution": job_settings.detectionResolution,
                "detections": detections_total,
                "detectionsPerFrame": round(detections_total / max(1, frames_detected), 2),
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
                "analyzed_coverage_percent": round(coverage_fraction * 100, 1),
                "full_video_analyzed": truncated_reason is None,
            },
        }
    finally:
        # Temporary film is always removed, success or failure.
        temp.cleanup()
