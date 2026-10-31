"""Origin-IP discovery: find servers that sit *behind* a CDN/Cloudflare.

When the main site is Cloudflare-fronted, the real origin often leaks through
non-proxied records — mail, ftp, cpanel, dev/staging hosts, etc. We resolve a
list of common such names and keep any IP that is public and NOT in a CDN
range. These are *candidates* (e.g. mail may be a third-party provider), so they
are reported as low-severity leads, not confirmed findings.
"""

from pathlib import Path

from . import dnsx
from ..validation import is_cloudflare_ip, normalize_public_ip

# Hostnames that are commonly NOT put behind the CDN proxy.
COMMON_PREFIXES = [
    "direct", "origin", "direct-connect", "cpanel", "whm", "webmail", "mail",
    "mail2", "smtp", "pop", "imap", "ftp", "sftp", "ssh", "server", "server1",
    "host", "vpn", "remote", "portal", "dev", "development", "staging", "stage",
    "test", "testing", "uat", "beta", "demo", "api", "admin", "backend",
    "ns1", "ns2", "autodiscover", "cpcontacts", "webdisk", "shop", "store",
]


def run(domain: str, workdir: Path) -> dict[str, str]:
    """Return {candidate_ip: via_hostname} for likely origin servers."""
    names = [f"{p}.{domain}" for p in COMMON_PREFIXES]
    try:
        resolved = dnsx.run(names, workdir)
    except Exception:
        return {}

    candidates: dict[str, str] = {}
    for hostname, info in resolved.items():
        if info.get("cdn_name"):
            continue  # dnsx says this one is itself behind a CDN
        for ip in info.get("ips", []):
            if not normalize_public_ip(ip) or is_cloudflare_ip(ip):
                continue
            candidates.setdefault(ip, hostname)
    return candidates
