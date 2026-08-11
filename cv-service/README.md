# Player Analysis CV Service

Production computer-vision service for player identification, tracking and
candidate-clip generation. It implements the contract the application already
speaks (`src/lib/analysis/provider.server.ts`), so the app needs no changes to
switch from the development mock to real inference.

## Endpoints

| Method | Path                      | Purpose |
| ------ | ------------------------- | ------- |
| POST   | `/jobs`                   | Submit a job, returns `{ externalJobId }` |
| GET    | `/jobs/{id}/status`       | `{ status, progressPercent, currentStage, errorCode, errorMessage }` |
| GET    | `/jobs/{id}/results`      | tracks, candidates, needsConfirmation, metrics, debugFrames |
| POST   | `/jobs/{id}/cancel`       | Best-effort cancellation |
| GET    | `/health`                 | Readiness + device (`cpu`/`cuda`) |

All endpoints except `/health` require `Authorization: Bearer <ANALYSIS_SERVICE_API_KEY>`.
If no key is configured the service refuses work with `503 service_not_configured` —
it never runs unauthenticated.

## Pipeline

1. **Authorized retrieval** — the app sends a short-lived signed URL. The film is
   streamed to a per-job temp directory and deleted when the job ends. The
   service is never long-term film storage.
2. **Person detection** — torchvision Faster R-CNN (MobileNetV3-Large FPN, COCO).
   Optional sports-ball detection for involvement scoring.
3. **Multi-object tracking** — IoU + appearance association with short-term
   occlusion memory. Track ids are per-video and are never player ids.
4. **Identification / re-identification (0.5.0)** — a learned appearance
   embedding (ImageNet ResNet-18, global pooled, flip-averaged, running-mean
   centred) is the primary signal; torso/leg colour histograms are secondary and
   uniform-colour affinity plus temporal continuity are tertiary. References
   live in a multi-view **reference bank**: user-confirmed same-game crops
   (weight 1.0) outrank auto-collected in-game crops (0.82), which outrank the
   player's reference library (0.55/0.34). Every candidate crop is quality
   scored (size, sharpness, exposure, occlusion) and bucketed by pose/court
   zone so the bank keeps genuinely different views instead of duplicates.
   No face recognition; jersey legibility is a bonus signal only.
5. **Needs-confirmation** — when identity confidence drops below the threshold
   the service does **not** switch athletes. It keeps the current target and
   emits a confirmation request with candidate boxes for the user to resolve.
6. **Candidate involvement segments** — motion + ball proximity + identity
   confidence grouped into windows with pre/post roll. Original AI timestamps
   are always returned alongside padded output. No basketball semantics.

## Deployment

### Build

```bash
docker build -t player-cv-service ./cv-service
```

### Run (CPU — sufficient for first validation)

```bash
docker run -d --name player-cv-service \
  -p 8000:8000 \
  --shm-size=1g \
  -e ANALYSIS_SERVICE_API_KEY="<32+ char random value, same as the app secret>" \
  -e APP_BASE_URL="https://<your-app-domain>" \
  -e CV_WORK_DIR=/tmp/cv-jobs \
  -e OMP_NUM_THREADS=4 \
  -e CV_LOG_LEVEL=INFO \
  player-cv-service
```

### Run (GPU — optional)

Requires a CUDA base image / CUDA torch wheel and the NVIDIA container runtime.
Nothing else changes; the code selects CUDA automatically.

```bash
docker run -d --gpus all -p 8000:8000 -e ANALYSIS_SERVICE_API_KEY=... player-cv-service
```

**Port:** `8000` (override with `PORT`). Container listens on `0.0.0.0`.

### Startup validation

The service validates configuration during FastAPI startup and **refuses to
boot** when required configuration is missing or invalid (missing/short API key,
unwritable `CV_WORK_DIR`, out-of-range thresholds). Non-fatal issues
(`APP_BASE_URL`, `TORCH_HOME` unset) are logged as warnings.

### Health & readiness

`GET /health` (unauthenticated, used by the container healthcheck and platform probes):

```json
{
  "ok": true,
  "status": "healthy",
  "version": "cv-service-0.1.0",
  "device": "cpu",
  "configured": true,
  "startupError": null,
  "personDetectorVersion": "fasterrcnn_mobilenet_v3_large_fpn-coco-0.1",
  "trackerVersion": "iou-appearance-tracker-0.2",
  "reidentificationVersion": "colorhist-torso-embed-0.2",
  "gpuAvailable": false,
  "activeJobs": 0
}
```

`GET /ready` returns the same component versions plus `torchVersion`,
`threads`, `gpuName`, `modelWeightsCached`, and returns **503** while the
service is not ready.

### Logging

Emitted at INFO: service startup, job submitted, source download
started/completed (bytes only), video probed, reference media loaded, inference
started/completed, frames decoded, tracking completed, job complete, results
returned, temp file deleted, job cancelled, job failed (with stack trace).

Never logged: API keys / bearer tokens, OAuth tokens, signed Drive or storage
URLs, reference-media URLs. Media URLs pass through `safe_source()`, which keeps
only scheme + host and drops every query string.

### Temporary file lifecycle

Film is downloaded to `${CV_WORK_DIR}/<jobId>/source.mp4` and the whole per-job
directory is removed in a `finally` block, so it is deleted after successful,
failed, and cancelled jobs alike. Deletion is logged.

### Known deployment limitations

- **Single replica.** Job state is in-process (`app/jobs.py`); a second replica
  will not see another's jobs. Run one instance, or swap in a shared queue —
  the HTTP contract does not change.
- **Ephemeral job state.** A restart loses in-flight jobs; the app surfaces them
  as failed and they must be resubmitted.
- **CPU throughput.** MobileNetV3 Faster R-CNN at 5 fps / 960 px runs roughly
  2-6 frames/sec on 4 CPU cores, so a full game is slow; `CV_MAX_FRAMES`
  (default 9000) caps each job. Raise CPU/memory or use GPU for full games.
- **Memory/disk.** Sized for one job at a time: ~2 GB RAM plus enough disk in
  `CV_WORK_DIR` for the largest source file (the Nigeria vs Cameroon upload is
  ~459 MB). Use a real disk or a large tmpfs.
- **Request timeouts.** Platforms with short request timeouts are fine — `/jobs`
  returns immediately and progress is polled — but the platform must not sleep
  or scale the container to zero while a job runs.
- **No model hot-swap.** Detector weights are baked at build time; changing
  models means rebuilding the image.

## Required environment variables

### CV service

| Variable | Required | Default | Meaning |
| -------- | -------- | ------- | ------- |
| `ANALYSIS_SERVICE_API_KEY` | **yes** | — | Bearer key; must match the app secret. Min 16 chars. Startup fails without it. |
| `APP_BASE_URL` | recommended | — | Public app origin, used for diagnostics/callbacks. Warns if missing. |
| `PORT` | no | 8000 | Listen port |
| `CV_WORK_DIR` | no | `/tmp/cv-jobs` | Temp per-job film directory; must be writable |
| `TORCH_HOME` | no | `/models` (set in image) | Model weight cache; baked at build time |
| `XDG_CACHE_HOME` / `HF_HOME` | no | `/models/...` | Keeps all caches off the home dir |
| `CV_MAX_WORKERS` | no | 1 | Concurrent jobs per instance |
| `CV_MAX_FRAMES` | no | 9000 | Hard frame cap per job |
| `CV_DEBUG_FRAMES` | no | 6 | Annotated sample frames returned |
| `CV_LOG_LEVEL` | no | INFO | DEBUG / INFO / WARNING |
| `OMP_NUM_THREADS` | no | 4 | Torch CPU threads; set to the container's CPU limit |
| `ANALYSIS_FPS` | no | 5 | Sampling rate for analysis |
| `ANALYSIS_DETECTION_RESOLUTION` | no | 960 | Detection frame width |
| `ANALYSIS_DETECTION_CONFIDENCE` | no | 0.35 | Minimum detection score |
| `ANALYSIS_IDENTITY_HIGH` / `_MEDIUM` | no | 0.80 / 0.55 | Identity confidence bands |
| `ANALYSIS_CONFIRMATION_THRESHOLD` | no | 0.55 | Below this, ask the user |
| `ANALYSIS_PRE_ROLL` / `_POST_ROLL` | no | 3 / 4 | Clip padding (seconds) |
| `ANALYSIS_BALL_DETECTION` | no | true | Ball proximity signal |
| `CV_EMBEDDER` | no | resnet18 | Appearance embedding backbone; `none` = colour histograms only |
| `CV_EMBED_WEIGHT` | no | 0.75 | Embedding share of appearance similarity (rest is colour) |
| `CV_EMBED_WIDTH` / `CV_EMBED_HEIGHT` | no | 128 / 256 | Crop resize for embedding (cubic upscale for tiny boxes) |
| `CV_EMBED_BATCH` | no | 64 | Embedding batch size |
| `CV_EMBED_FLIP` | no | true | Average each crop with its mirror (view invariance) |
| `CV_EMBED_CENTER` | no | true | Subtract the running mean embedding before cosine |
| `CV_REFERENCE_TOP_K` | no | 3 | Reference views aggregated per match |
| `CV_REFERENCE_MIN_QUALITY` | no | 0.34 | Quality floor for auto/low-trust references |
| `CV_AUTO_REFERENCE` | no | true | Collect high-quality in-game target crops as references |
| `CV_AUTO_REFERENCE_INTERVAL` | no | 12 | Seconds between auto-collected references |

### Application

| Secret | Required | Meaning |
| ------ | -------- | ------- |
| `ANALYSIS_SERVICE_URL` | **yes** | e.g. `https://cv.example.com` (no trailing path). Missing -> jobs fail `analysis_service_unavailable`; never silent mock. |
| `ANALYSIS_SERVICE_API_KEY` | **yes** | Must equal the service value |
| `APP_BASE_URL` | for Drive film | Public origin used to build the Drive streaming URL handed to the service. Direct uploads do not need it. |

## Authorized source access

The app hands the service a short-lived URL, never credentials:

- **Direct upload** — a 6 h signed storage URL (range-capable).
  Verified for `Nigeria vs Cameroon`: asset `provider=upload`,
  `video/mp4`, ~459 MB, 10 940 s, object present in the `game-film` bucket, so
  `resolveFilmAccessUrl` returns a signed URL the service can stream.
- **Google Drive** — `${APP_BASE_URL}/api/public/drive-stream/<assetId>?token=<hmac>`,
  the same proxy the in-app player uses; Drive OAuth tokens stay server-side.
- **YouTube / Hudl embeds** — no raw video access, so they remain analysis-ineligible by design.

## RUNPOD DEPLOYMENT

The image is built and published automatically by GitHub Actions
(`.github/workflows/cv-service-image.yml`) on every push to `main` that touches
`cv-service/**`. No cloning, `pip install`, or building inside Runpod.

### Container image

```text
ghcr.io/ozie33/sport-film-hub-cv:latest
ghcr.io/ozie33/sport-film-hub-cv:sha-<git-commit-sha>   # pinned / rollback
```

Use `latest` for normal deploys, a `sha-...` tag to pin or roll back.

### Port

Exposed port: **8000** (HTTP). Runpod should expose 8000 as an HTTP port. The
container honours `PORT` if the platform injects a different one.

### Required Runpod environment variables

Never baked into the image — always set at runtime:

| Variable | Required | Value |
| -------- | -------- | ----- |
| `ANALYSIS_SERVICE_API_KEY` | **yes** | 32+ char random value, identical to the app secret |
| `APP_BASE_URL` | recommended | `https://sport-film-hub.lovable.app` |
| `PORT` | no | `8000` |
| `CV_WORK_DIR` | no | `/tmp/cv-jobs` (must be writable; use a volume for large film) |
| `OMP_NUM_THREADS` | no | match the pod's CPU count, e.g. `4` |
| `CV_LOG_LEVEL` | no | `INFO` |

The service refuses to boot without a valid `ANALYSIS_SERVICE_API_KEY` or a
writable `CV_WORK_DIR`.

### Health and readiness

```bash
curl -s https://<pod-host>/health   # 200 when configured and ready
curl -s https://<pod-host>/ready    # 200 with versions, 503 while not ready
```

`/health` (also used by the container `HEALTHCHECK`) returns:

```json
{ "ok": true, "status": "healthy", "version": "cv-service-0.1.0", "device": "cpu",
  "configured": true, "startupError": null, "gpuAvailable": false, "activeJobs": 0 }
```

Both endpoints are unauthenticated; all job endpoints require
`Authorization: Bearer <ANALYSIS_SERVICE_API_KEY>`.

### Verify GPU availability

Start the pod on a CUDA host with the NVIDIA runtime (Runpod GPU pods do this
automatically; locally use `docker run --gpus all`). Then:

```bash
curl -s https://<pod-host>/ready | grep -o '"gpuAvailable":[a-z]*'   # expect true
curl -s https://<pod-host>/ready                                     # gpuName, torchVersion
nvidia-smi                                                           # inside the pod shell
```

`gpuAvailable: false` on a GPU pod means the installed torch wheel is CPU-only —
CPU inference still works, just slower (see throughput limits above).

### Update the deployed image

1. Push a change under `cv-service/**` to `main`; the workflow publishes
   `:latest` and `:sha-<commit>` to GHCR.
2. In Runpod, restart/redeploy the pod so it re-pulls the tag (set the image to
   the new `sha-...` tag to pin an exact build).
3. Confirm the rollout: `curl -s https://<pod-host>/health` and check
   `/ready` reports the expected versions.

Rollback = redeploy with the previous `sha-<commit>` tag.

## Performance profile (0.2.0)

| Setting | Env var | Default |
|---|---|---|
| Detector | `CV_DETECTOR` / `CV_YOLO_WEIGHTS` | `yolo` / baked `yolov8n.pt` (fp16 on CUDA) |
| Sampling FPS | `ANALYSIS_FPS` | `2` |
| Detection width | `ANALYSIS_DETECTION_RESOLUTION` | `640` |
| Batch size | `CV_BATCH_SIZE` | `32` |
| Detection cadence | `CV_DETECT_EVERY` | every 2nd sampled frame (~1 Hz), motion-tracked between |
| Re-ID cadence | `CV_REID_INTERVAL_SECONDS` | `5` s plus event triggers (new track, reappearance, low confidence, ambiguity, confirmation) |
| Court filter | `CV_COURT_FILTER`, `CV_COURT_TOP_EXCLUDE`, `CV_COURT_MIN_HEIGHT`, `CV_COURT_MAX_HEIGHT` | on |
| Dead-time skip | `CV_DEAD_TIME_SKIP`, `CV_DEAD_TIME_MOTION`, `CV_DEAD_TIME_SCENE` | on |
| Coverage | `CV_MAX_FRAMES` | `0` (no frame cap — full film) |
| Safety limit | `CV_JOB_BUDGET_SECONDS` | `1500` (wall clock; truncation is reported, never silent) |

Decoding is done by ffmpeg (`fps=<analysisFps>,scale=<width>:-2`), so the source is never
walked frame by frame. Clip timestamps are always original-video timestamps.
Logs report per-stage seconds, per-call milliseconds, GPU utilisation, frames
decoded vs detected vs motion-tracked vs dead-time skipped, and analysed coverage.

## Phase 3G — target recall + re-ID efficiency (cv-service-0.6.0)

Two-stage re-identification, appearance caching and target hysteresis. No
architectural change: the calibrated similarity system and the reference bank
from 0.5.2 are preserved.

* **Stage 1 shortlist** (`CV_REID_SHORTLIST`, `CV_REID_SHORTLIST_TOP_K=6`) ranks
  detections with cheap signals only — proximity to the predicted target
  position, motion continuity with active tracks, uniform affinity. Only the top
  K uncached crops reach the ResNet on non-event frames.
* **Embedding cache** (`CV_EMBED_CACHE`, `CV_EMBED_CACHE_SECONDS=1.6`,
  `CV_EMBED_CACHE_MIN_IOU=0.62`) reuses a vector for the same spatial slot until
  the box drifts, another person overlaps it (occlusion), the entry goes stale,
  or detection confidence collapses.
* **Prototype reference bank** (`CV_PROTOTYPE_BANK`, `CV_PROTOTYPE_COUNT=6`)
  compares against one representative view per trust/pose bucket first and only
  expands to the full bank when the score sits within
  `CV_PROTOTYPE_AMBIGUOUS_MARGIN` of the decision gate.
* **Context-aware rescue**: gates drop (bounded by
  `CV_RESCUE_CONTEXT_BONUS_MAX`) for candidates near the predicted position,
  with strong motion continuity, or with high uniform affinity, and rise by
  `CV_RESCUE_FAR_PENALTY` beyond `CV_TARGET_RECALL_FAR_PX`.
* **Target hysteresis**: the retain gate is discounted by
  `CV_TARGET_HYSTERESIS_BONUS=0.05`, while switching needs a larger margin
  (`0.24`) sustained over more frames (`4`).
* **Candidate generation** keeps short but valid target segments
  (`CV_CANDIDATE_MIN_SEGMENT=0.3`, `CV_CANDIDATE_GAP_LIMIT=3.5`).

Only target-side rescue/re-acquisition gates were loosened; generic association
and non-target matching are unchanged. New diagnostics live under
`metrics.reidEfficiency`, `metrics.targetRecall.targetRescueDecisionsByContext`,
`metrics.targetTrackChangeCauses` and the `prototype*` keys in
`metrics.appearance`.
