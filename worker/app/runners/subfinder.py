"""Stage a: passive subdomain enumeration."""

from pathlib import Path

from ..config import get_settings
from ..proc import ToolError, read_jsonl, run_tool
from ..validation import normalize_domain


def run(domain: str, workdir: Path) -> list[dict]:
    """Return [{"name": str, "sources": [str]}], apex first, capped at MAX_SUBDOMAINS."""
    s = get_settings()
    out = workdir / "subfinder.jsonl"
    result = run_tool(
        [
            s.subfinder_bin,
            "-d", domain,
            "-oJ", "-o", str(out),
            "-silent", "-nc", "-duc",
            "-timeout", "30",
            "-max-time", str(max(1, s.subfinder_timeout // 60 - 1)),
        ],
        timeout=s.subfinder_timeout,
        workdir=workdir,
        name="subfinder",
    )
    if result.returncode != 0 and not out.exists():
        raise ToolError(f"subfinder failed: {result.stderr_tail[-300:]}")

    found: dict[str, set[str]] = {domain: {"input"}}
    for row in read_jsonl(out):
        name = normalize_domain(str(row.get("host", "")))
        # Only keep names under the requested domain.
        if not name or not (name == domain or name.endswith("." + domain)):
            continue
        found.setdefault(name, set()).add(str(row.get("source") or "subfinder"))

    names = [domain] + sorted(n for n in found if n != domain)
    return [{"name": n, "sources": sorted(found[n])} for n in names[: s.max_subdomains]]
