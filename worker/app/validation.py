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
