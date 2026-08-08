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

## Deploy

```bash
docker build -t player-cv-service ./cv-service
docker run -p 8000:8000 \
  -e ANALYSIS_SERVICE_API_KEY=<same value as the app secret> \
  player-cv-service
```

GPU hosts: use a CUDA base image and `--gpus all`; the code selects CUDA
automatically when available. One replica processes jobs in a thread pool;
for multiple replicas replace `app/jobs.py` with a shared queue — the HTTP
contract is unchanged.

## Configuration

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `ANALYSIS_SERVICE_API_KEY` | — | Required bearer key |
| `ANALYSIS_FPS` | 5 | Sampling rate for analysis |
| `ANALYSIS_DETECTION_RESOLUTION` | 960 | Detection frame width |
| `ANALYSIS_DETECTION_CONFIDENCE` | 0.35 | Minimum detection score |
| `ANALYSIS_IDENTITY_HIGH` / `_MEDIUM` | 0.80 / 0.55 | Identity confidence bands |
| `ANALYSIS_CONFIRMATION_THRESHOLD` | 0.55 | Below this, ask the user |
| `ANALYSIS_PRE_ROLL` / `_POST_ROLL` | 3 / 4 | Clip padding (seconds) |
| `ANALYSIS_BALL_DETECTION` | true | Ball proximity signal |
| `CV_MAX_FRAMES` | 9000 | Hard cap per job |
| `CV_DEBUG_FRAMES` | 6 | Annotated sample frames returned |

## Connecting the app

Set these app secrets, then re-run an analysis:

- `ANALYSIS_SERVICE_URL` — e.g. `https://cv.example.com`
- `ANALYSIS_SERVICE_API_KEY` — must match the service
- `APP_BASE_URL` — required so Google Drive film can be streamed to the service

Without `ANALYSIS_SERVICE_URL` the app fails jobs with
`analysis_service_unavailable`. It never silently produces demo results; the
mock provider requires `ANALYSIS_PROVIDER=mock`.
