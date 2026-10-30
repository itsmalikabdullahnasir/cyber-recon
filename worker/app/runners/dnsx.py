"""Stage b: resolve names, keep only the ones that resolve."""

import ipaddress
from pathlib import Path

from ..config import get_settings
from ..proc import ToolError, read_jsonl, run_tool, write_list
from ..validation import normalize_domain


def _ips(values) -> list[str]:
    ips = []
    for v in values or []:
        try:
            ips.append(str(ipaddress.ip_address(str(v))))
        except ValueError:
            continue
    return ips


def run(names: list[str], workdir: Path) -> dict[str, dict]:
    """Return {name: {"ips": [...], "cdn_name": str | None}} for resolving names only."""
    s = get_settings()
    if not names:
        return {}
    inp = write_list(workdir / "dnsx.in.txt", names)
    out = workdir / "dnsx.jsonl"
    result = run_tool(
        [
            s.dnsx_bin,
            "-l", str(inp),
            "-json", "-o", str(out),
            "-a", "-aaaa", "-resp", "-cdn",
            "-retry", "2", "-t", "20",
            "-silent", "-nc", "-duc",
        ],
        timeout=s.dnsx_timeout,
        workdir=workdir,
        name="dnsx",
    )
    if result.returncode != 0 and not out.exists():
        raise ToolError(f"dnsx failed: {result.stderr_tail[-300:]}")

    wanted = set(names)
    resolved: dict[str, dict] = {}
    for row in read_jsonl(out):
        name = normalize_domain(str(row.get("host", "")))
        if name not in wanted:
            continue
        ips = _ips(row.get("a")) + _ips(row.get("aaaa"))
        if not ips:
            continue
        entry = resolved.setdefault(name, {"ips": [], "cdn_name": None})
        entry["ips"] = sorted(set(entry["ips"]) | set(ips))
        cdn = row.get("cdn_name") or row.get("cdn-name")
        if cdn:
            entry["cdn_name"] = str(cdn).lower()
    return resolved
