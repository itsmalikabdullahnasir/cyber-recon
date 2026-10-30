"""wafw00f — detect a Web Application Firewall in front of a URL."""

import json
from pathlib import Path

from ..config import get_settings
from ..proc import run_tool


def run(url: str, workdir: Path, name: str) -> str | None:
    """Return the detected WAF/vendor name, or None."""
    s = get_settings()
    out = workdir / f"wafw00f-{name}.json"
    run_tool(
        [s.wafw00f_bin, "-a", "-o", str(out), "-f", "json", url],
        timeout=s.wafw00f_timeout, workdir=workdir, name=f"wafw00f-{name}",
    )
    if not out.exists():
        return None
    try:
        data = json.loads(out.read_text(encoding="utf-8", errors="replace") or "[]")
    except json.JSONDecodeError:
        return None
    rows = data if isinstance(data, list) else [data]
    for row in rows:
        if not isinstance(row, dict):
            continue
        if row.get("detected") and row.get("firewall") and row["firewall"] != "None":
            vendor = row.get("manufacturer")
            return f"{row['firewall']}" + (f" ({vendor})" if vendor and vendor != row["firewall"] else "")
    return None
