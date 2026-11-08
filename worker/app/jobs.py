"""Persistent, strictly-sequential scan queue.

The queue lives in the database: a scan row with status 'queued' is a pending
job. A single background thread claims the OLDEST queued scan, runs it to
completion, then claims the next. Because it's one thread pulling from the DB:

- you can enqueue thousands of scans (just insert rows) and they drain one by
  one, in order, without overwhelming the 1 GB VM;
- the backlog survives worker restarts (queued rows are still there);
- a scan interrupted by a restart is marked failed on startup, and the poller
  moves on to the next queued one.
"""

import logging
import os
import threading
import time

from .pipeline import Pipeline
from .supa import Supabase, now_iso

log = logging.getLogger(__name__)

POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "4"))


class Poller:
    def __init__(self) -> None:
        self._thread = threading.Thread(target=self._loop, name="scan-poller", daemon=True)
        self._stop = threading.Event()
        self.current: str | None = None

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _claim_next(self) -> dict | None:
        """Atomically take the oldest queued scan (queued -> running)."""
        db = Supabase()
        try:
            rows = db.select("scans", {"status": "eq.queued", "order": "priority.desc,created_at.asc", "limit": "1"})
            if not rows:
                return None
            sid = rows[0]["id"]
            claimed = db.update(
                "scans",
                {"id": f"eq.{sid}", "status": "eq.queued"},
                {"status": "running", "started_at": now_iso()},
            )
            return claimed[0] if claimed else None
        except Exception:
            log.exception("claim_next failed")
            return None
        finally:
            db.close()

    def _loop(self) -> None:
        log.info("scan poller started (interval %ss)", POLL_INTERVAL)
        while not self._stop.is_set():
            scan = self._claim_next()
            if not scan:
                self._stop.wait(POLL_INTERVAL)
                continue
            self.current = scan["id"]
            log.info("running scan %s (%s %s)", scan["id"], scan.get("mode"), scan.get("input"))
            db = Supabase()
            try:
                Pipeline(db, scan).run()
            except Exception:
                log.exception("unhandled error in scan %s", scan["id"])
            finally:
                db.close()
                self.current = None


def recover_stale() -> None:
    """On startup, fail scans left 'running' by a previous crash. Queued ones stay."""
    db = Supabase()
    try:
        stale = db.select("scans", {"status": "eq.running"}, "id,retry_count,max_retries")
        for scan in stale:
            retry_count = int(scan.get("retry_count") or 0) + 1
            if retry_count <= int(scan.get("max_retries") or 3):
                db.update("scans", {"id": f"eq.{scan['id']}"},
                          {"status": "queued", "retry_count": retry_count, "error": "worker restarted; automatically re-queued"})
            else:
                db.update("scans", {"id": f"eq.{scan['id']}"},
                          {"status": "failed", "retry_count": retry_count,
                           "error": "worker restarted and retry limit was reached", "finished_at": now_iso()})
    except Exception:
        log.exception("could not reset stale running scans")
    finally:
        db.close()


def pending_count() -> int:
    db = Supabase()
    try:
        return len(db.select("scans", {"status": "in.(queued,running)"}, "id"))
    except Exception:
        return 0
    finally:
        db.close()
