"""testssl.sh — TLS/cert audit. Active tier (handshakes against the host)."""

import json
from pathlib import Path

from ..config import get_settings
from ..proc import run_tool

# testssl severities we keep as findings (OK/INFO/WARN dropped as noise).
KEEP = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}


def run(host: str, workdir: Path, name: str) -> list[dict]:
    """Return [{id, severity, finding, cve}] for notable TLS issues on <host>:443."""
    s = get_settings()
    out = workdir / f"testssl-{name}.json"
    run_tool(
        [s.testssl_bin, "--quiet", "--color", "0", "--fast", "--sneaky",
         "--jsonfile", str(out), "--severity", "LOW", f"{host}:443"],
        timeout=s.testssl_timeout, workdir=workdir, name=f"testssl-{name}",
    )
    if not out.exists():
        return []
    try:
        records = json.loads(out.read_text(encoding="utf-8", errors="replace") or "[]")
    except json.JSONDecodeError:
        return []

    findings = []
    for rec in records if isinstance(records, list) else []:
        severity = str(rec.get("severity", "")).upper()
        if severity not in KEEP:
            continue
        findings.append({
            "id": str(rec.get("id", "tls")),
            "severity": severity,
            "finding": str(rec.get("finding", ""))[:500],
            "cve": (rec.get("cve") or "").split(" ")[0] or None,
        })
    return findings
