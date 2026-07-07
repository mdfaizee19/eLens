import contextvars
import logging
import time
from collections import defaultdict

logger = logging.getLogger("app.profiling")

_timings: contextvars.ContextVar[dict] = contextvars.ContextVar("profiling_timings", default=None)


def start_request() -> dict:
    timings = defaultdict(float)
    _timings.set(timings)
    return timings


class stage:
    """Context manager that accumulates wall time under `name` for the
    current request. No-op if start_request() wasn't called first."""

    def __init__(self, name: str):
        self.name = name

    def __enter__(self):
        self._t0 = time.perf_counter()
        return self

    def __exit__(self, *exc_info):
        elapsed = time.perf_counter() - self._t0
        timings = _timings.get()
        if timings is not None:
            timings[self.name] += elapsed


def log_request_timings(label: str) -> None:
    timings = _timings.get()
    if timings:
        total = sum(timings.values())
        breakdown = ", ".join(f"{k}={v:.4f}s" for k, v in timings.items())
        logger.info("[timing] %s: total=%.4fs (%s)", label, total, breakdown)
