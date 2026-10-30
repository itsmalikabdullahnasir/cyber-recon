"""nikto — web-server misconfiguration / known-file scanner. Active tier, noisy."""

import json
from pathlib import Path

from ..config import get_settings
from ..proc import run_tool


def run(url: str, workdir: Path, name: str) -> list[dict]:
    """Return [{id, msg, url, method}] of nikto findings."""
    s = get_settings()
    out = workdir / f"nikto-{name}.json"
    run_tool(
        [
            s.nikto_bin,
            "-host", url,
            "-Format", "json", "-output", str(out),
            "-maxtime", f"{max(60, s.nikto_timeout - 60)}s",
            "-Tuning", "123bde",  # file/dir/info checks; skip DoS & brute tuning
            "-nointeractive", "-ask", "no",
        ],
        timeout=s.nikto_timeout, workdir=workdir, name=f"nikto-{name}",
    )
    if not out.exists():
        return []
    try:
        data = json.loads(out.read_text(encoding="utf-8", errors="replace") or "{}")
    except json.JSONDecodeError:
        return []
    # nikto JSON is sometimes a list of host objects, sometimes a single object.
    hosts = data if isinstance(data, list) else [data]
    findings = []
    for host in hosts:
        for v in (host.get("vulnerabilities") or []) if isinstance(host, dict) else []:
            findings.append({
                "id": str(v.get("id", "")),
                "msg": str(v.get("msg", ""))[:500],
                "url": str(v.get("url", ""))[:500],
                "method": str(v.get("method", "GET")),
            })
    return findings
