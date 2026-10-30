"""Recon worker API.

POST /scan   (X-Worker-Secret required)  -> 202 accepted, scan runs in the background
GET  /health (no secret)                 -> {"ok": true}; reveals nothing else
"""

import hmac
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .config import get_settings
from .jobs import JobQueue, QueueFull, recover_stale
from .supa import Supabase
from .validation import InvalidTarget, parse_target

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("worker")

jobs: JobQueue | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global jobs
    s = get_settings()  # fail fast if env is missing
    s.results_dir.mkdir(parents=True, exist_ok=True)
    recover_stale()
    jobs = JobQueue(s.queue_max)
    jobs.start()
    yield


app = FastAPI(title="cyber-recon worker", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


def require_secret(x_worker_secret: str = Header(default="")) -> None:
    expected = get_settings().worker_secret.encode()
    if not hmac.compare_digest(x_worker_secret.encode(), expected):
        raise HTTPException(status_code=401, detail="unauthorized")


class ScanRequest(BaseModel):
    target: str = Field(min_length=1, max_length=255)
    scan_id: uuid.UUID
    mode: Literal["passive", "full"]


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/scan", status_code=202, dependencies=[Depends(require_secret)])
def scan(req: ScanRequest) -> dict:
    try:
        _, normalized = parse_target(req.target)
    except InvalidTarget as e:
        raise HTTPException(status_code=400, detail=str(e))

    # The scan row (created by the Vercel route) is the source of truth:
    # target_id, mode and who to notify all come from the DB, not the request.
    db = Supabase()
    try:
        rows = db.select("scans", {"id": f"eq.{req.scan_id}"})
    finally:
        db.close()
    if not rows:
        raise HTTPException(status_code=404, detail="scan not found")
    row = rows[0]
    if row["status"] != "queued":
        raise HTTPException(status_code=409, detail=f"scan is {row['status']}")
    try:
        _, row_target = parse_target(row["input"])
    except InvalidTarget:
        raise HTTPException(status_code=400, detail="scan row has an invalid target")
    if row_target != normalized or row["mode"] != req.mode:
        raise HTTPException(status_code=400, detail="request does not match the scan row")

    assert jobs is not None
    try:
        position = jobs.submit(row)
    except QueueFull:
        raise HTTPException(status_code=429, detail="queue full, try later")
    if position < 0:
        raise HTTPException(status_code=409, detail="scan already queued")
    log.info("accepted scan %s (%s %s), position %d", row["id"], row["mode"], normalized, position)
    return {"status": "accepted", "scan_id": str(req.scan_id), "position": position}
