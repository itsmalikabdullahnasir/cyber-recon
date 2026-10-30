"""Stage g: nuclei against in-scope live URLs. ACTIVE. Templates are local (~/nuclei-templates)."""

from pathlib import Path

from ..config import get_settings
from ..proc import ToolError, read_jsonl, run_tool, write_list


def run(urls: list[str], workdir: Path) -> list[dict]:
    s = get_settings()
    if not urls:
        return []
    inp = write_list(workdir / "nuclei.in.txt", urls)
    out = workdir / "nuclei.jsonl"
    result = run_tool(
        [
            s.nuclei_bin,
            "-l", str(inp),
            "-t", s.nuclei_templates,
            "-jsonl", "-o", str(out),
            "-rl", "10", "-c", "5", "-bs", "5",
            "-severity", s.nuclei_severity,
            "-etags", s.nuclei_exclude_tags,
            "-timeout", "10", "-retries", "1", "-mhe", "10",
            "-ni",  # no interactsh: no third-party OOB callbacks
            "-silent", "-nc", "-duc",
        ],
        timeout=s.nuclei_timeout,
        workdir=workdir,
        name="nuclei",
    )
    if result.returncode != 0 and not out.exists():
        raise ToolError(f"nuclei failed: {result.stderr_tail[-300:]}")
    return [parse_result(row) for row in read_jsonl(out)]


def parse_result(row: dict) -> dict:
    info = row.get("info") or {}
    cls = info.get("classification") or {}
    cves = cls.get("cve-id") or []
    cwes = cls.get("cwe-id") or []
    refs = info.get("reference") or []
    return {
        "template_id": str(row.get("template-id", "")),
        "name": str(info.get("name") or row.get("template-id") or "nuclei finding")[:300],
        "severity": str(info.get("severity") or "info").lower(),
        "description": (info.get("description") or "")[:2000],
        "remediation": (info.get("remediation") or "")[:2000] or None,
        "host": str(row.get("host") or ""),
        "matched_at": str(row.get("matched-at") or row.get("host") or "")[:500],
        "ip": row.get("ip"),
        "cve": str(cves[0]).upper() if isinstance(cves, list) and cves else None,
        "cwe": str(cwes[0]).upper() if isinstance(cwes, list) and cwes else None,
        "cvss": cls.get("cvss-score"),
        "references": refs[:5] if isinstance(refs, list) else [str(refs)],
        "extracted": (row.get("extracted-results") or [])[:5],
        "matcher": row.get("matcher-name"),
    }
