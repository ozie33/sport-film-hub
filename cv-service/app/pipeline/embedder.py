"""Learned appearance embedding for person re-identification (Phase 3F).

Why this exists
---------------
Phase 3E proved the tracker keeps whoever it is told to keep; the failure was
the *appearance model*. A colour histogram of the torso cannot separate ten
athletes in the same uniform on 240p film, so 842 real target candidates were
rejected and rescued crops averaged an appearance score of 0.155.

This module adds a convolutional embedding (ImageNet-pretrained ResNet, global
pooled) as the PRIMARY appearance signal. Colour histograms stay as a secondary
signal (see `reid.signature`).

Low-resolution robustness
-------------------------
  * crops are upscaled with a cubic filter to a fixed 128x256 person aspect,
    so a 20px-tall crop and a 200px-tall crop produce comparable vectors
  * the embedding is averaged with its horizontal mirror, which removes the
    left/right-facing component and makes front/back/side views of the same
    athlete agree more
  * a running mean embedding is subtracted before normalisation. ImageNet
    features are dominated by a large "generic person on a court" component;
    removing it turns near-useless 0.9-vs-0.85 cosines into a discriminative
    0.7-vs-0.15 spread. This is dataset-agnostic, so it works the same way on
    720p/1080p film — nothing here is tuned to one game.
"""

from __future__ import annotations

import cv2
import numpy as np
import torch

from app.config import EMBEDDING_VERSION, settings
from app.logging_setup import get_logger

log = get_logger("cv.embedder")

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class AppearanceEmbedder:
    """Batched person-appearance embedder. Fails soft to histogram-only."""

    def __init__(self, backend: str | None = None) -> None:
        self.requested_backend = backend or settings.embedder_backend
        self.backend = "none"
        self.backend_error: str | None = None
        self.version = EMBEDDING_VERSION
        self.dim = 0
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.half = bool(settings.use_fp16 and self.device.type == "cuda")
        self._model = None
        self._mean: np.ndarray | None = None
        self._mean_samples = 0
        self.embeddings_computed = 0
        if self.requested_backend != "none":
            self._load()

    # ------------------------------------------------------------------ load
    def _load(self) -> None:
        try:
            import torchvision  # noqa: PLC0415
            from torch import nn  # noqa: PLC0415

            name = self.requested_backend
            builder = getattr(torchvision.models, name, None)
            if builder is None:
                raise RuntimeError(f"unknown embedder backend '{name}'")
            net = builder(weights="IMAGENET1K_V1")
            # Everything up to (and including) global average pooling.
            backbone = nn.Sequential(*(list(net.children())[:-1]))
            backbone.eval()
            backbone.to(self.device)
            if self.half:
                backbone.half()
            self._model = backbone
            self.dim = int(getattr(net, "fc").in_features)
            self.backend = name
            log.info(
                "appearance embedder loaded backend=%s dim=%d device=%s fp16=%s",
                self.backend,
                self.dim,
                self.device.type,
                self.half,
            )
        except Exception as error:  # noqa: BLE001
            self.backend = "none"
            self.backend_error = f"{type(error).__name__}: {error}"
            self._model = None
            self.dim = 0
            log.error("appearance embedder unavailable: %s", self.backend_error)

    @property
    def available(self) -> bool:
        return self._model is not None and self.dim > 0

    # --------------------------------------------------------------- helpers
    def _preprocess(self, patch: np.ndarray) -> np.ndarray | None:
        if patch.size == 0 or patch.shape[0] < 4 or patch.shape[1] < 2:
            return None
        resized = cv2.resize(
            patch,
            (settings.embed_width, settings.embed_height),
            interpolation=cv2.INTER_CUBIC,
        )
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        rgb = (rgb - IMAGENET_MEAN) / IMAGENET_STD
        return np.transpose(rgb, (2, 0, 1))

    def _update_mean(self, raw: np.ndarray) -> None:
        batch_mean = raw.mean(axis=0)
        if self._mean is None:
            self._mean = batch_mean.astype(np.float32)
        else:
            momentum = float(settings.embed_mean_momentum)
            self._mean = ((1.0 - momentum) * self._mean + momentum * batch_mean).astype(np.float32)
        self._mean_samples += int(raw.shape[0])

    def _postprocess(self, raw: np.ndarray) -> np.ndarray:
        """Remove the generic component, then L2-normalise."""
        vectors = raw.astype(np.float32)
        if settings.embed_center and self._mean is not None and self._mean_samples >= 32:
            vectors = vectors - self._mean
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vectors / norms

    # ----------------------------------------------------------------- embed
    def embed_crops(self, patches: list[np.ndarray]) -> list[np.ndarray | None]:
        """Embed already-cropped BGR patches, preserving input order."""
        if not self.available or not patches:
            return [None] * len(patches)
        tensors: list[np.ndarray] = []
        index_map: list[int] = []
        for index, patch in enumerate(patches):
            prepared = self._preprocess(patch)
            if prepared is None:
                continue
            tensors.append(prepared)
            index_map.append(index)
        results: list[np.ndarray | None] = [None] * len(patches)
        if not tensors:
            return results
        out: list[np.ndarray] = []
        chunk = max(1, int(settings.embed_batch_size))
        with torch.inference_mode():
            for start in range(0, len(tensors), chunk):
                block = np.stack(tensors[start : start + chunk])
                batch = torch.from_numpy(block).to(self.device)
                if self.half:
                    batch = batch.half()
                features = self._model(batch).flatten(1).float()
                if settings.embed_flip_average:
                    mirrored = self._model(torch.flip(batch, dims=[3])).flatten(1).float()
                    features = (features + mirrored) / 2.0
                out.append(features.cpu().numpy())
        raw = np.concatenate(out, axis=0)
        self.embeddings_computed += int(raw.shape[0])
        self._update_mean(raw)
        normalised = self._postprocess(raw)
        for slot, vector in zip(index_map, normalised):
            results[slot] = vector.astype(np.float32)
        return results

    def stats(self) -> dict:
        return {
            "embeddingModel": self.backend,
            "embeddingModelRequested": self.requested_backend,
            "embeddingModelError": self.backend_error,
            "embeddingVersion": self.version,
            "embeddingDimensions": self.dim,
            "embeddingPrecision": "fp16" if self.half else "fp32",
            "embeddingDevice": self.device.type,
            "embeddingsComputed": self.embeddings_computed,
            "embeddingCentering": bool(settings.embed_center),
            "embeddingFlipAveraged": bool(settings.embed_flip_average),
        }


_embedder: AppearanceEmbedder | None = None


def embedder() -> AppearanceEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = AppearanceEmbedder()
    return _embedder
