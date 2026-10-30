"""whatweb — web-stack fingerprint (CMS, frameworks, language + versions).

Passive tier: one stealthy request (-a 1). Output feeds the version->CVE match.
"""

import json
from pathlib import Path

from ..config import get_settings
from ..proc import run_tool


def run(url: str, workdir: Path, name: str) -> list[tuple[str, str | None]]:
    """Return [(product, version_or_None)] from whatweb's plugin list."""
    s = get_settings()
    out = workdir / f"whatweb-{name}.json"
    run_tool(
        [s.whatweb_bin, "-a", "1", "--no-errors", "--quiet",
         f"--log-json={out}", "--max-threads", "1", url],
        timeout=s.whatweb_timeout, workdir=workdir, name=f"whatweb-{name}",
    )
    if not out.exists():
        return []
    try:
        records = json.loads(out.read_text(encoding="utf-8", errors="replace") or "[]")
    except json.JSONDecodeError:
        return []

    tech: list[tuple[str, str | None]] = []
    for rec in records if isinstance(records, list) else []:
        plugins = rec.get("plugins") or {}
        for product, detail in plugins.items():
            versions = detail.get("version") if isinstance(detail, dict) else None
            if versions:
                for v in versions:
                    tech.append((product, str(v)))
            else:
                tech.append((product, None))
    return tech
