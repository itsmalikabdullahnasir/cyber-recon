"""Strict input validation. Everything that reaches a command line passes through here."""

import ipaddress
import re

_LABEL = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")
_TLD = re.compile(r"^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$")


class InvalidTarget(ValueError):
    pass


def normalize_domain(value: str) -> str | None:
    """Return a lowercase ASCII (punycode) hostname, or None if it isn't one."""
    value = value.strip().lower().rstrip(".")
    if not value or len(value) > 253:
        return None
    try:
        value = value.encode("idna").decode("ascii")
    except UnicodeError:
        return None
    labels = value.split(".")
    if len(labels) < 2 or not all(_LABEL.match(label) for label in labels):
        return None
    if not _TLD.match(labels[-1]):
        return None
    return value


# Cloudflare's published IPv4 ranges (https://www.cloudflare.com/ips/).
_CLOUDFLARE_NETS = [
    ipaddress.ip_network(c) for c in (
        "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
        "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
        "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
        "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
    )
]


def is_cloudflare_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value.strip())
    except ValueError:
        return False
    return any(ip.version == net.version and ip in net for net in _CLOUDFLARE_NETS)


def normalize_public_ip(value: str) -> str | None:
    """Return the canonical form of a globally routable IP, or None.

    Private, loopback, link-local (incl. 169.254.169.254 cloud metadata),
    multicast and reserved ranges are rejected so the worker can't be turned
    against the VM's own network.
    """
    try:
        ip = ipaddress.ip_address(value.strip())
    except ValueError:
        return None
    if not ip.is_global or ip.is_multicast:
        return None
    return str(ip)


def parse_target(value: str) -> tuple[str, str]:
    """Return ("ip" | "domain", normalized value) or raise InvalidTarget."""
    if not isinstance(value, str) or len(value) > 255:
        raise InvalidTarget("target must be a string")
    ip = normalize_public_ip(value)
    if ip:
        return "ip", ip
    try:
        ipaddress.ip_address(value.strip())
    except ValueError:
        pass
    else:
        raise InvalidTarget("IP is not publicly routable")
    domain = normalize_domain(value)
    if domain:
        return "domain", domain
    raise InvalidTarget("target must be a domain name or a public IP address")
