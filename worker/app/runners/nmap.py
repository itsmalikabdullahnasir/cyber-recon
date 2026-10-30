"""Stage e: nmap SYN + version scan of one in-scope, non-CDN IP. ACTIVE."""

from pathlib import Path

from defusedxml import ElementTree

from ..config import get_settings
from ..proc import ToolError, run_tool
from ..validation import normalize_public_ip


def parse_xml(path: Path) -> dict:
    """Parse nmap -oX output into {"ports": [...], "os": str | None}."""
    root = ElementTree.parse(path).getroot()
    ports = []
    for port in root.iter("port"):
        state = port.find("state")
        if state is None or state.get("state") != "open":
            continue
        svc = port.find("service")
        ports.append({
            "port": int(port.get("portid", 0)),
            "protocol": port.get("protocol", "tcp"),
            "service": svc.get("name") if svc is not None else None,
            "product": svc.get("product") if svc is not None else None,
            "version": svc.get("version") if svc is not None else None,
            "extrainfo": svc.get("extrainfo") if svc is not None else None,
            "ostype": svc.get("ostype") if svc is not None else None,
            "cpe": [c.text for c in svc.findall("cpe") if c.text] if svc is not None else [],
        })
    ports.sort(key=lambda p: (p["protocol"], p["port"]))
    os_guess = next((p["ostype"] for p in ports if p.get("ostype")), None)
    return {"ports": ports, "os": os_guess}


def run(ip: str, workdir: Path) -> dict:
    s = get_settings()
    ip = normalize_public_ip(ip) or ""
    if not ip:
        raise ToolError("refusing to nmap a non-public IP")
    out = workdir / f"nmap-{ip.replace(':', '_')}.xml"
    result = run_tool(
        [
            s.nmap_bin,
            "--privileged",
            "-sS", "-sV", "-T3", "-Pn",
            "--top-ports", str(s.nmap_top_ports),
            "--max-retries", "2",
            "--host-timeout", f"{s.nmap_host_timeout}s",
            "-oX", str(out),
            ip,
        ],
        timeout=s.nmap_host_timeout + 120,
        workdir=workdir,
        name=f"nmap-{ip.replace(':', '_')}",
    )
    if not out.exists() or out.stat().st_size == 0:
        raise ToolError(f"nmap produced no XML (rc={result.returncode}): {result.stderr_tail[-300:]}")
    return parse_xml(out)
