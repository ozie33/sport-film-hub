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
4. **Identification / re-identification** — trust-weighted appearance gallery
   built from user-confirmed crops (highest trust), game crops, then reference
   photos, combined with uniform-colour affinity and temporal continuity.
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
