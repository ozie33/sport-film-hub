"""Structured logging with hard redaction of anything credential-bearing.

Rules (never relaxed):
  * signed media URLs, Drive URLs and reference-media URLs are never logged
  * API keys / bearer tokens / OAuth tokens are never logged
  * only shapes are logged: host, byte counts, durations, counts
"""

from __future__ import annotations

import logging
import os
import sys
from urllib.parse import urlsplit

_CONFIGURED = False


def configure_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    level = os.environ.get("CV_LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, level, logging.INFO))
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(name)


def safe_source(url: str | None) -> str:
    """Return a non-sensitive descriptor of a media URL: scheme + host only.

    Query strings hold signed tokens, so they are dropped entirely.
    """
    if not url:
        return "none"
    try:
        parts = urlsplit(url)
        if not parts.netloc:
            return "opaque"
        return f"{parts.scheme}://{parts.netloc}/<redacted-path>"
    except Exception:  # noqa: BLE001
        return "opaque"
