"""Tiny PostgREST client using the service-role key (bypasses RLS: keep it on the VM only)."""

import logging
from datetime import datetime, timezone

import httpx

from .config import get_settings

log = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Supabase:
    def __init__(self) -> None:
        s = get_settings()
        self._client = httpx.Client(
            base_url=f"{s.supabase_url}/rest/v1",
            headers={
                "apikey": s.supabase_service_key,
                "Authorization": f"Bearer {s.supabase_service_key}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )

    def close(self) -> None:
        self._client.close()

    def _check(self, res: httpx.Response) -> list[dict]:
        if res.status_code >= 400:
            raise RuntimeError(f"Supabase {res.request.method} {res.request.url.path}: {res.status_code} {res.text[:300]}")
        return res.json() if res.content else []

    def select(self, table: str, filters: dict[str, str], columns: str = "*") -> list[dict]:
        return self._check(self._client.get(f"/{table}", params={"select": columns, **filters}))

    def insert(self, table: str, rows: dict | list[dict], on_conflict: str | None = None,
               ignore_duplicates: bool = False) -> list[dict]:
        headers = {"Prefer": "return=representation"}
        params = {}
        if on_conflict:
            headers["Prefer"] += ",resolution=" + ("ignore-duplicates" if ignore_duplicates else "merge-duplicates")
            params["on_conflict"] = on_conflict
        return self._check(self._client.post(f"/{table}", json=rows, headers=headers, params=params))

    def update(self, table: str, filters: dict[str, str], values: dict) -> list[dict]:
        return self._check(
            self._client.patch(f"/{table}", params=filters, json=values, headers={"Prefer": "return=representation"})
        )

    # -- helpers used by the pipeline ---------------------------------------
    def notify(self, email: str | None, title: str, message: str, target_id: str) -> None:
        if not email:
            return
        try:
            self.insert("notifications", {
                "user_email": email, "title": title, "message": message[:500],
                "target_id": target_id, "read": False,
            })
        except Exception:
            log.exception("notification insert failed")

    def activity(self, target_id: str, action: str, detail: str) -> None:
        try:
            self.insert("activities", {
                "target_id": target_id, "user_name": "recon-worker",
                "action": action, "detail": detail[:1000],
            })
        except Exception:
            log.exception("activity insert failed")
