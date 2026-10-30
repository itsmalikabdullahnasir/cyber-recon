"""Authorized-scope checks for the ACTIVE stages (nmap, nuclei).

A host may be actively scanned only if the Target is marked "In Scope" AND
the hostname or the IP matches one of that Target's scope_entries rows.
Anything that fails to parse is treated as out of scope.
"""

import ipaddress
from dataclasses import dataclass, field

from .validation import normalize_domain


@dataclass
class Scope:
    target_in_scope: bool
    domains: set[str] = field(default_factory=set)
    wildcards: set[str] = field(default_factory=set)  # stored without the "*." prefix
    networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = field(default_factory=list)

    @classmethod
    def from_rows(cls, target_scope: str | None, rows: list[dict]) -> "Scope":
        scope = cls(target_in_scope=(target_scope == "In Scope"))
        for row in rows:
            kind, value = row.get("kind"), str(row.get("value", "")).strip().lower()
            if kind == "domain":
                if d := normalize_domain(value):
                    scope.domains.add(d)
            elif kind == "wildcard":
                if value.startswith("*.") and (d := normalize_domain(value[2:])):
                    scope.wildcards.add(d)
            elif kind in ("ip", "cidr"):
                try:
                    scope.networks.append(ipaddress.ip_network(value, strict=False))
                except ValueError:
                    continue
        return scope

    @property
    def empty(self) -> bool:
        return not (self.domains or self.wildcards or self.networks)

    def hostname_allowed(self, name: str | None) -> bool:
        if not self.target_in_scope or not name:
            return False
        name = normalize_domain(name)
        if not name:
            return False
        if name in self.domains:
            return True
        return any(name.endswith("." + parent) for parent in self.wildcards)

    def ip_allowed(self, ip: str | None) -> bool:
        if not self.target_in_scope or not ip:
            return False
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        return any(addr.version == net.version and addr in net for net in self.networks)

    def host_allowed(self, name: str | None, ip: str | None) -> bool:
        return self.hostname_allowed(name) or self.ip_allowed(ip)
