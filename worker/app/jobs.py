"""One-at-a-time job queue. A single background thread drains it, so only one
scan ever runs on the 1 GB VM. The queue is in memory: on restart, any scan
left queued/running is marked failed (see recover_stale)."""

import logging
import queue
import threading

from .pipeline import Pipeline
from .supa import Supabase, now_iso

log = logging.getLogger(__name__)


class QueueFull(Exception):
    pass


class JobQueue:
    def __init__(self, maxsize: int) -> None:
        self._q: queue.Queue[dict] = queue.Queue(maxsize=maxsize)
        self._ids: set[str] = set()  # queued or running
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._loop, name="scan-worker", daemon=True)
        self.current: str | None = None

    def start(self) -> None:
        self._thread.start()

    def submit(self, scan: dict) -> int:
        """Enqueue a scan row; returns its position (0 = runs next)."""
        with self._lock:
            if scan["id"] in self._ids:
                return -1
            try:
                self._q.put_nowait(scan)
            except queue.Full:
                raise QueueFull from None
            self._ids.add(scan["id"])
            return self._q.qsize() - 1 + (1 if self.current else 0)

    def depth(self) -> int:
        return self._q.qsize()

    def _loop(self) -> None:
        while True:
            scan = self._q.get()
            self.current = scan["id"]
            db = Supabase()
            try:
                Pipeline(db, scan).run()
            except Exception:
                log.exception("unhandled error in scan %s", scan["id"])
            finally:
                db.close()
                with self._lock:
                    self._ids.discard(scan["id"])
                    self.current = None
                self._q.task_done()


def recover_stale() -> None:
    db = Supabase()
    try:
        for status in ("queued", "running"):
            db.update("scans", {"status": f"eq.{status}"},
                      {"status": "failed", "error": "worker restarted before the scan finished",
                       "finished_at": now_iso()})
    except Exception:
        log.exception("could not mark stale scans")
    finally:
        db.close()
