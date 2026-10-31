"""Module registry — the single source of truth for what scanning modules
exist, what they need, and what they produce.

Why this file exists
--------------------
The pipeline used to be a fixed sequence hardcoded in ``pipeline.py``. To make
it dynamic (user-built profiles, add a module without editing the pipeline),
both the frontend and the executor need a machine-readable description of every
module: its category, the tool it runs, what it depends on, what it emits, and
whether its binary is actually installed on *this* VM.

That description lives here. Adding a new scanning capability then becomes:
write a runner in ``runners/`` and add one ``ModuleDef`` below — no pipeline
surgery, no frontend edit (the UI reads this list over ``GET /modules``).

This module is pure metadata plus a live "is the binary installed?" check. It
never starts a process, so importing it is free and safe.
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field

from ..config import Settings

# Two tiers, mirroring the passive/active split the scope gate already enforces
# in pipeline.py. PASSIVE modules are read-only and run on any valid target;
# ACTIVE modules touch the target and run only against authorized scope.
PASSIVE = "passive"
ACTIVE = "active"

# Dashboard categories (section 7 of the spec). Keep these stable: the UI groups
# modules by the exact strings below.
CATEGORIES = [
    "Asset Discovery",
    "Network Intelligence",
    "Web Intelligence",
    "Endpoint Intelligence",
    "API Security",
    "Vulnerability Assessment",
    "SSL & DNS Security",
    "Content Discovery",
    "Email Security",
    "Risk Intelligence",
    "Reports",
]


@dataclass(frozen=True)
class ModuleDef:
    """Static description of one scanning module."""

    id: str                       # stable key; MUST match the stage name in scans.stages
    name: str                     # human label shown in the UI
    description: str              # one line: what it does, in plain terms
    category: str                 # one of CATEGORIES
    tier: str                     # PASSIVE (safe anywhere) or ACTIVE (scope-gated)
    tools: list[str] = field(default_factory=list)        # Settings attrs holding the binary paths
    tools_any: bool = False       # True: installed if ANY listed tool exists (not all)
    dependencies: list[str] = field(default_factory=list)          # module ids that must run first
    optional_dependencies: list[str] = field(default_factory=list)
    inputs: list[str] = field(default_factory=list)       # context keys it consumes
    outputs: list[str] = field(default_factory=list)      # context keys / tables it writes
    enabled_by_default: bool = True
    parallel_safe: bool = False   # safe to run alongside other modules (future use)
    timeout_setting: str | None = None   # Settings attr giving its timeout, if any
    enable_setting: str | None = None    # Settings bool that turns it on/off, if any


# ---------------------------------------------------------------------------
# The modules that exist TODAY. Order here is the natural execution order and
# matches STAGE_ORDER in components/ScanRow.tsx. New modules get appended in
# later phases; nothing here changes the pipeline's behaviour on its own.
# ---------------------------------------------------------------------------
MODULES: list[ModuleDef] = [
    ModuleDef(
        id="subfinder",
        name="Subdomain Enumeration",
        description="Passively discovers subdomains of a domain from public sources.",
        category="Asset Discovery",
        tier=PASSIVE,
        tools=["subfinder_bin"],
        inputs=["domain"],
        outputs=["subdomains"],
        timeout_setting="subfinder_timeout",
    ),
    ModuleDef(
        id="dnsx",
        name="DNS Resolution",
        description="Resolves discovered names to IPs and flags which are live.",
        category="Asset Discovery",
        tier=PASSIVE,
        tools=["dnsx_bin"],
        dependencies=["subfinder"],
        inputs=["subdomains"],
        outputs=["resolved_ips"],
        timeout_setting="dnsx_timeout",
    ),
    ModuleDef(
        id="httpx",
        name="HTTP Probe",
        description="Probes hosts over HTTP(S) for status, title, tech, ASN and CDN.",
        category="Web Intelligence",
        tier=PASSIVE,
        tools=["httpx_bin"],
        dependencies=["dnsx"],
        inputs=["resolved_ips", "domain"],
        outputs=["live_hosts", "tech", "cdn", "asn"],
        timeout_setting="httpx_timeout",
    ),
    ModuleDef(
        id="fingerprint",
        name="Tech Fingerprint & WAF",
        description="Deeper tech fingerprinting (whatweb) and WAF detection (wafw00f).",
        category="Web Intelligence",
        tier=PASSIVE,
        tools=["whatweb_bin", "wafw00f_bin"],
        tools_any=True,
        dependencies=["httpx"],
        inputs=["live_hosts"],
        outputs=["tech", "waf"],
        timeout_setting="whatweb_timeout",
    ),
    ModuleDef(
        id="origin",
        name="Origin-IP Discovery",
        description="For CDN-fronted sites, looks for the real origin leaking via non-proxied records.",
        category="Asset Discovery",
        tier=PASSIVE,
        tools=[],  # DNS-based, uses the resolver — no external binary required
        dependencies=["httpx"],
        inputs=["live_hosts", "cdn"],
        outputs=["origin_ips", "findings"],
    ),
    ModuleDef(
        id="cve",
        name="CVE Matching",
        description="Matches product+version against the local NVD mirror (offline).",
        category="Vulnerability Assessment",
        tier=PASSIVE,
        tools=[],  # uses the local cve.sqlite3 DB, not a binary
        dependencies=["httpx"],
        optional_dependencies=["nmap"],
        inputs=["tech"],
        outputs=["findings"],
    ),
    ModuleDef(
        id="nmap",
        name="Port Scan",
        description="Active TCP port + service/version scan of in-scope live hosts.",
        category="Network Intelligence",
        tier=ACTIVE,
        tools=["nmap_bin"],
        dependencies=["httpx"],
        inputs=["live_hosts"],
        outputs=["ports", "services"],
        timeout_setting="nmap_host_timeout",
    ),
    ModuleDef(
        id="testssl",
        name="TLS Audit",
        description="Audits TLS configuration and certificate issues with testssl.sh.",
        category="SSL & DNS Security",
        tier=ACTIVE,
        tools=["testssl_bin"],
        dependencies=["httpx"],
        inputs=["live_hosts"],
        outputs=["findings"],
        timeout_setting="testssl_timeout",
        enable_setting="enable_testssl",
    ),
    ModuleDef(
        id="dirs",
        name="Directory Brute-force",
        description="Content/directory discovery with feroxbuster against in-scope hosts.",
        category="Content Discovery",
        tier=ACTIVE,
        tools=["feroxbuster_bin"],
        dependencies=["httpx"],
        inputs=["live_hosts"],
        outputs=["findings"],
        timeout_setting="feroxbuster_timeout",
        enable_setting="enable_feroxbuster",
    ),
    ModuleDef(
        id="nuclei",
        name="Vulnerability Templates",
        description="Runs nuclei templates against in-scope, non-CDN hosts.",
        category="Vulnerability Assessment",
        tier=ACTIVE,
        tools=["nuclei_bin"],
        dependencies=["httpx"],
        inputs=["live_hosts"],
        outputs=["findings"],
        timeout_setting="nuclei_timeout",
    ),
    ModuleDef(
        id="nikto",
        name="Web-server Scan",
        description="Web-server misconfiguration scan with nikto (noisy; off by default).",
        category="Vulnerability Assessment",
        tier=ACTIVE,
        tools=["nikto_bin"],
        dependencies=["httpx"],
        inputs=["live_hosts"],
        outputs=["findings"],
        enabled_by_default=False,
        timeout_setting="nikto_timeout",
        enable_setting="enable_nikto",
    ),
]

MODULES_BY_ID: dict[str, ModuleDef] = {m.id: m for m in MODULES}

# Built-in profiles are editable starting points for the Pipeline Builder.
# The default passive/full scan routes intentionally omit the slow TLS audit;
# users can add it from the module list or load Full — Everything.
BUILTIN_PROFILES: dict[str, dict] = {
    "basic_passive": {
        "name": "Basic — Passive",
        "description": "Read-only recon: subdomains, DNS, HTTP probe, fingerprint, CVE-by-version.",
        "modules": ["subfinder", "dnsx", "httpx", "fingerprint", "origin", "cve"],
        "builtin": True,
    },
    "basic_full": {
        "name": "Basic — Full (active)",
        "description": "Passive recon plus scoped nmap, directory discovery and nuclei. TLS is optional.",
        "modules": ["subfinder", "dnsx", "httpx", "fingerprint", "origin", "cve",
                    "nmap", "dirs", "nuclei"],
        "builtin": True,
    },
    "full_all": {
        "name": "Full — Everything",
        "description": "Every module in order — passive recon plus all active scans (nmap, TLS, dir brute, nuclei, nikto). Load it and trim what you don't want.",
        "modules": ["subfinder", "dnsx", "httpx", "fingerprint", "origin", "cve",
                    "nmap", "testssl", "dirs", "nuclei", "nikto"],
        "builtin": True,
    },
}


def _installed(settings: Settings, m: ModuleDef) -> bool:
    """True if the module's binary/binaries are present and executable on this VM.

    Modules with no external binary (origin, cve) are always 'installed' — their
    readiness (e.g. the CVE DB being synced) is reported separately by the
    pipeline at run time.
    """
    paths = [getattr(settings, attr, "") for attr in m.tools]
    if not paths:
        return True
    checks = [bool(p) and os.access(p, os.X_OK) for p in paths]
    return any(checks) if m.tools_any else all(checks)


def _enabled_on_vm(settings: Settings, m: ModuleDef) -> bool:
    if m.enable_setting:
        return bool(getattr(settings, m.enable_setting, True))
    return True


def module_json(settings: Settings, m: ModuleDef) -> dict:
    d = asdict(m)
    d["installed"] = _installed(settings, m)
    d["enabled_on_vm"] = _enabled_on_vm(settings, m)
    d["timeout"] = getattr(settings, m.timeout_setting, None) if m.timeout_setting else None
    return d


def registry_json(settings: Settings) -> dict:
    """The full registry payload served to the frontend over GET /modules."""
    return {
        "categories": CATEGORIES,
        "modules": [module_json(settings, m) for m in MODULES],
        "profiles": BUILTIN_PROFILES,
    }
