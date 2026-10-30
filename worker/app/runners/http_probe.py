"""Stages c + d: httpx probe (status, title, tech, ASN) and CDN/Cloudflare flag."""

import ipaddress
from pathlib import Path

from ..config import get_settings
from ..proc import ToolError, read_jsonl, run_tool, write_list
from ..validation import normalize_domain, normalize_public_ip


def _args(inp: Path, out: Path, with_asn: bool) -> list[str]:
    s = get_settings()
    args = [
        s.httpx_bin,
        "-l", str(inp),
        "-json", "-o", str(out),
        "-sc", "-title", "-td", "-server", "-ip", "-cdn",
        "-fhr",  # follow redirects on the same host only
        "-t", "10", "-rl", "20", "-timeout", "10", "-retries", "1",
        "-silent", "-nc", "-duc",
    ]
    if with_asn:
        args.append("-asn")
    return args


def _asn(row: dict) -> str | None:
    asn = row.get("asn")
    if isinstance(asn, dict):
        parts = [asn.get("as_number"), asn.get("as_name"), asn.get("as_country")]
        text = " ".join(str(p) for p in parts if p)
        return text or None
    return str(asn) if asn else None


def run(names: list[str], workdir: Path) -> tuple[dict[str, dict], str | None]:
    """Return ({name: probe}, warning). Only names that answered HTTP(S) are included."""
    s = get_settings()
    if not names:
        return {}, None
    inp = write_list(workdir / "httpx.in.txt", names)
    out = workdir / "httpx.jsonl"
    warning = None

    result = run_tool(_args(inp, out, s.httpx_asn), timeout=s.httpx_timeout, workdir=workdir, name="httpx")
    if result.returncode != 0 and s.httpx_asn and not result.timed_out:
        # -asn needs a ProjectDiscovery cloud key on newer httpx; retry without it.
        warning = "httpx -asn failed (PDCP_API_KEY missing?); ran without ASN"
        out.unlink(missing_ok=True)
        result = run_tool(_args(inp, out, False), timeout=s.httpx_timeout, workdir=workdir, name="httpx-noasn")
    if result.returncode != 0 and not out.exists():
        raise ToolError(f"httpx failed: {result.stderr_tail[-300:]}")

    wanted = set(names)
    probes: dict[str, dict] = {}
    for row in read_jsonl(out):
        raw = str(row.get("input", "")).split("://")[-1].split("/")[0]
        name = normalize_public_ip(raw) or normalize_domain(raw.split(":")[0])
        if name not in wanted:
            continue
        ips = []
        for v in (row.get("a") or []) + [row.get("host")]:
            try:
                ips.append(str(ipaddress.ip_address(str(v))))
            except ValueError:
                continue
        cdn_name = str(row.get("cdn_name") or "").lower() or None
        probe = {
            "url": row.get("url"),
            "scheme": row.get("scheme"),
            "status_code": row.get("status_code"),
            "title": (row.get("title") or "")[:300] or None,
            "webserver": (row.get("webserver") or "")[:200] or None,
            "tech": sorted({str(t)[:100] for t in row.get("tech") or []}),
            "ips": sorted(set(ips)),
            "is_cdn": bool(row.get("cdn")) or bool(cdn_name),
            "cdn_name": cdn_name,
            "asn": _asn(row),
        }
        # Prefer the HTTPS result if httpx reported both.
        if name not in probes or probe["scheme"] == "https":
            probes[name] = probe
    return probes, warning


def tech_versions(tech: list[str]) -> list[tuple[str, str]]:
    """httpx tech entries look like "Nginx:1.18.0" -> [("nginx", "1.18.0")]. Unversioned are dropped."""
    pairs = []
    for t in tech:
        if ":" in t:
            product, _, version = t.partition(":")
            product, version = product.strip().lower(), version.strip()
            if product and version and version[0].isdigit():
                pairs.append((product, version))
    return pairs
