"""whatweb — web-stack fingerprint (CMS, frameworks, language + versions).

Passive tier: one stealthy request (-a 1). Output feeds the version->CVE match.
"""

import json
import re
from pathlib import Path

from ..config import get_settings
from ..proc import run_tool

# Pull "Product/1.2.3" or "Product 1.2.3" out of header strings like
# "X-Powered-By: PHP/7.4.3" or "Server: Apache/2.4.41".
_VER_RE = re.compile(r"([A-Za-z][A-Za-z0-9 .+_-]*?)[/ ]v?(\d+\.\d[\w.]*)")


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
            if not isinstance(detail, dict):
                tech.append((product, None))
                continue
            versions = detail.get("version")
            if versions:
                for v in versions:
                    tech.append((product, str(v)))
            else:
                tech.append((product, None))
            # Dig a version out of header/banner strings (e.g. X-Powered-By: PHP/7.4.3).
            for s in detail.get("string") or []:
                m = _VER_RE.search(str(s))
                if m:
                    tech.append((m.group(1).strip(), m.group(2)))
    return tech
