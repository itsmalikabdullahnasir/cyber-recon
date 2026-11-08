"""Conservative Chromium screenshots for already-probed public web hosts."""

import re
from pathlib import Path

from ..config import get_settings
from ..proc import ToolError, run_tool


def classify(title: str | None, url: str) -> str:
    """A UI hint, not a security decision. Keep the original URL/title as evidence."""
    text = f"{title or ''} {url}".lower()
    if re.search(r"\b(log[ -]?in|sign[ -]?in|authenticate|sso|password)\b", text):
        return "login"
    if re.search(r"\b(dashboard|admin|console|portal|control panel)\b", text):
        return "dashboard"
    return "public"


def run(url: str, workdir: Path, name: str, title: str | None = None) -> dict | None:
    """Capture one page with a bounded, sandbox-friendly Chromium invocation.

    The caller must supply a URL produced by httpx after public-IP validation.
    Chromium receives an argument list (never a shell) and a fresh profile unless
    an operator configured a dedicated authenticated profile for this engagement.
    """
    s = get_settings()
    if not s.enable_screenshots:
        return None
    safe_name = re.sub(r"[^a-z0-9._-]", "_", name.lower())[:80] or "page"
    output = workdir / f"screenshot-{safe_name}.png"
    args = [
        s.chromium_bin, "--headless", "--disable-gpu", "--no-first-run",
        "--disable-background-networking", "--disable-sync", "--disable-extensions",
        "--window-size=1440,900", "--hide-scrollbars", "--virtual-time-budget=8000",
        f"--screenshot={output}", url,
    ]
    if s.screenshot_profile_dir:
        args.insert(-1, f"--user-data-dir={s.screenshot_profile_dir}")
    result = run_tool(args, timeout=s.screenshot_timeout, workdir=workdir, name=f"screenshot-{safe_name}")
    if result.returncode != 0 or not output.exists() or output.stat().st_size == 0:
        if result.returncode != 0:
            raise ToolError(f"chromium screenshot failed: {result.stderr_tail[-250:]}")
        return None
    return {"path": output, "page_type": classify(title, url), "bytes": output.stat().st_size}
