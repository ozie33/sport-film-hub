# Production image for the Player Analysis CV service.
# CPU-only by default (sufficient for MVP validation); CUDA is used automatically
# when the container is started on a GPU host with a CUDA-enabled torch build.
FROM python:3.11-slim

# Build metadata (supplied by CI; harmless defaults for local builds).
ARG SERVICE_VERSION=cv-service-0.1.0
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="Player Analysis CV Service" \
      org.opencontainers.image.version="${SERVICE_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      com.sportfilmhub.service-version="${SERVICE_VERSION}" \
      com.sportfilmhub.git-commit="${GIT_COMMIT}" \
      com.sportfilmhub.build-date="${BUILD_DATE}"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # Non-secret build metadata, readable at runtime for diagnostics.
    CV_SERVICE_VERSION=${SERVICE_VERSION} \
    CV_GIT_COMMIT=${GIT_COMMIT} \
    CV_BUILD_DATE=${BUILD_DATE} \
    # Enable NVIDIA GPU passthrough when the host runtime provides it.
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    # Model weight cache. Baked into the image at build time so cold starts do
    # not download anything and no development-only path is required.
    TORCH_HOME=/models \
    HF_HOME=/models/hf \
    XDG_CACHE_HOME=/models/cache \
    # Temporary per-job film directory. Must be writable; overridable at runtime.
    CV_WORK_DIR=/tmp/cv-jobs \
    # Headless OpenCV: never try to open a display.
    OPENCV_IO_ENABLE_OPENEXR=0 \
    QT_QPA_PLATFORM=offscreen \
    OMP_NUM_THREADS=4 \
    YOLO_CONFIG_DIR=/models/ultralytics \
    CV_YOLO_WEIGHTS=/models/yolov8n.pt \
    CV_DETECTOR=yolo \
    CV_FP16=true \
    CV_BATCH_SIZE=32 \
    CV_DETECT_EVERY=2 \
    ANALYSIS_FPS=2 \
    ANALYSIS_DETECTION_RESOLUTION=640 \
    CV_MAX_FRAMES=0 \
    CV_JOB_BUDGET_SECONDS=1500 \
    CV_LOG_LEVEL=INFO \
    PORT=8000

# ffmpeg + libgl/libglib give OpenCV full video decoding in headless Linux.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Warm the detector weights into the image so cold starts don't download them.
# The download must land exactly at CV_YOLO_WEIGHTS and the build FAILS if YOLO
# cannot be loaded — a silent miss here is what caused the runtime fallback to
# Faster R-CNN while /ready still advertised YOLO.
RUN mkdir -p /models /models/ultralytics /models/hf /models/cache "$CV_WORK_DIR" \
    && python -c "\
from ultralytics import YOLO;\
m = YOLO('yolov8n.pt');\
import shutil, os;\
src = str(m.ckpt_path if hasattr(m, 'ckpt_path') and m.ckpt_path else 'yolov8n.pt');\
dst = os.environ['CV_YOLO_WEIGHTS'];\
shutil.copy(src, dst) if os.path.abspath(src) != os.path.abspath(dst) else None;\
print('yolo weights baked at', dst)" \
    && test -s "$CV_YOLO_WEIGHTS" \
    && python -c "\
from app.pipeline.detector import PersonDetector;\
d = PersonDetector('yolo');\
assert d.backend == 'yolo', 'YOLO backend failed to load: ' + str(d.backend_error)" \
    && python -c "from app.pipeline.detector import PersonDetector; PersonDetector('torchvision')" \
    && chmod -R a+rwX /models

# Run unprivileged; the app only needs to write to CV_WORK_DIR.
RUN useradd --create-home --uid 10001 cvsvc \
    && chown -R cvsvc:cvsvc /srv "$CV_WORK_DIR" /models
USER cvsvc

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health" > /dev/null || exit 1

# sh -c so ${PORT} can be overridden by the hosting platform.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --timeout-keep-alive 75"]
