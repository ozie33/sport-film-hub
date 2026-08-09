"""Per-stage instrumentation: wall clock per stage plus GPU utilisation."""

from __future__ import annotations

import time
from collections import defaultdict
from contextlib import contextmanager

try:  # torch is present in the service image; keep timing usable without it.
    import torch
except ModuleNotFoundError:  # pragma: no cover
    torch = None  # type: ignore[assignment]


class StageTimer:
    """Accumulates milliseconds per named stage (decode/detect/track/reid/...)."""

    def __init__(self) -> None:
        self._totals: dict[str, float] = defaultdict(float)
        self._counts: dict[str, int] = defaultdict(int)
        self.started = time.time()

    @contextmanager
    def stage(self, name: str):
        begin = time.perf_counter()
        try:
            yield
        finally:
            self._totals[name] += (time.perf_counter() - begin) * 1000.0
            self._counts[name] += 1

    def add(self, name: str, milliseconds: float) -> None:
        self._totals[name] += milliseconds
        self._counts[name] += 1

    @property
    def elapsed(self) -> float:
        return time.time() - self.started

    def totals_ms(self) -> dict[str, float]:
        return {name: round(value, 1) for name, value in sorted(self._totals.items())}

    def per_call_ms(self) -> dict[str, float]:
        return {
            name: round(value / max(1, self._counts[name]), 2)
            for name, value in sorted(self._totals.items())
        }

    def summary(self) -> str:
        parts = [f"{name}={value / 1000.0:.1f}s" for name, value in sorted(self._totals.items())]
        return " ".join(parts)


def gpu_stats() -> dict[str, float | str | None]:
    """Best-effort GPU telemetry; returns device only when NVML is unavailable."""
    if torch is None or not torch.cuda.is_available():
        return {"device": "cpu"}
    stats: dict[str, float | str | None] = {"device": "cuda"}
    try:
        stats["name"] = torch.cuda.get_device_name(0)
    except Exception:  # noqa: BLE001
        stats["name"] = None
    try:
        stats["utilizationPercent"] = float(torch.cuda.utilization(0))
    except Exception:  # noqa: BLE001
        stats["utilizationPercent"] = None
    try:
        stats["memoryAllocatedMb"] = round(torch.cuda.memory_allocated(0) / 1e6, 1)
        stats["memoryReservedMb"] = round(torch.cuda.memory_reserved(0) / 1e6, 1)
    except Exception:  # noqa: BLE001
        pass
    return stats
