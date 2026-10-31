"""Settings, read once from the environment (systemd loads them from .env)."""

import os
from dataclasses import dataclass, field
from pathlib import Path


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


def _bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not set")
    return value


@dataclass(frozen=True)
class Settings:
    worker_secret: str = field(default_factory=lambda: _required("WORKER_SECRET"))
    supabase_url: str = field(default_factory=lambda: _required("SUPABASE_URL").rstrip("/"))
    supabase_service_key: str = field(default_factory=lambda: _required("SUPABASE_SERVICE_ROLE_KEY"))

    results_dir: Path = field(default_factory=lambda: Path(os.environ.get("RESULTS_DIR", "/home/ubuntu/recon/results")))
    cve_db_path: Path = field(default_factory=lambda: Path(os.environ.get("CVE_DB_PATH", "/home/ubuntu/recon/cve.sqlite3")))
    nvd_api_key: str = field(default_factory=lambda: os.environ.get("NVD_API_KEY", "").strip())

    # Tool binaries. Full paths so the service never depends on ~/.bashrc.
    subfinder_bin: str = field(default_factory=lambda: os.environ.get("SUBFINDER_BIN", "/home/ubuntu/.pdtm/go/bin/subfinder"))
    dnsx_bin: str = field(default_factory=lambda: os.environ.get("DNSX_BIN", "/home/ubuntu/.pdtm/go/bin/dnsx"))
    httpx_bin: str = field(default_factory=lambda: os.environ.get("HTTPX_BIN", "/home/ubuntu/.pdtm/go/bin/httpx"))
    nuclei_bin: str = field(default_factory=lambda: os.environ.get("NUCLEI_BIN", "/home/ubuntu/.pdtm/go/bin/nuclei"))
    nmap_bin: str = field(default_factory=lambda: os.environ.get("NMAP_BIN", "/usr/bin/nmap"))
    nuclei_templates: str = field(default_factory=lambda: os.environ.get("NUCLEI_TEMPLATES", "/home/ubuntu/nuclei-templates"))
    # Extra Kali-style tools (installed separately; see worker/README).
    feroxbuster_bin: str = field(default_factory=lambda: os.environ.get("FEROXBUSTER_BIN", "/usr/bin/feroxbuster"))
    whatweb_bin: str = field(default_factory=lambda: os.environ.get("WHATWEB_BIN", "/usr/bin/whatweb"))
    wafw00f_bin: str = field(default_factory=lambda: os.environ.get("WAFW00F_BIN", "/usr/bin/wafw00f"))
    nikto_bin: str = field(default_factory=lambda: os.environ.get("NIKTO_BIN", "/usr/bin/nikto"))
    testssl_bin: str = field(default_factory=lambda: os.environ.get("TESTSSL_BIN", "/home/ubuntu/testssl.sh/testssl.sh"))
    wordlist: str = field(default_factory=lambda: os.environ.get("WORDLIST", "/usr/share/seclists/Discovery/Web-Content/common.txt"))

    # Per-tool enable flags (so a missing binary doesn't fail every scan).
    enable_whatweb: bool = field(default_factory=lambda: _bool("ENABLE_WHATWEB", True))
    enable_wafw00f: bool = field(default_factory=lambda: _bool("ENABLE_WAFW00F", True))
    enable_testssl: bool = field(default_factory=lambda: _bool("ENABLE_TESTSSL", True))
    enable_feroxbuster: bool = field(default_factory=lambda: _bool("ENABLE_FEROXBUSTER", True))
    enable_nikto: bool = field(default_factory=lambda: _bool("ENABLE_NIKTO", False))  # noisy/slow: off by default

    # feroxbuster intensity (conservative defaults for the 1 GB box).
    ferox_threads: int = field(default_factory=lambda: _int("FEROX_THREADS", 10))
    ferox_rate_limit: int = field(default_factory=lambda: _int("FEROX_RATE_LIMIT", 50))
    ferox_depth: int = field(default_factory=lambda: _int("FEROX_DEPTH", 1))
    ferox_max_results: int = field(default_factory=lambda: _int("FEROX_MAX_RESULTS", 200))
    ferox_status: str = field(default_factory=lambda: os.environ.get("FEROX_STATUS", "200,204,301,302,307,401,403,405,500"))

    # Resource limits (1 vCPU / 1 GB RAM).
    queue_max: int = field(default_factory=lambda: _int("QUEUE_MAX", 5))
    max_subdomains: int = field(default_factory=lambda: _int("MAX_SUBDOMAINS", 500))
    max_heavy_hosts: int = field(default_factory=lambda: _int("MAX_HEAVY_HOSTS", 20))
    cve_max_per_product: int = field(default_factory=lambda: _int("CVE_MAX_PER_PRODUCT", 10))

    # Per-command timeouts, seconds.
    subfinder_timeout: int = field(default_factory=lambda: _int("SUBFINDER_TIMEOUT", 600))
    dnsx_timeout: int = field(default_factory=lambda: _int("DNSX_TIMEOUT", 600))
    httpx_timeout: int = field(default_factory=lambda: _int("HTTPX_TIMEOUT", 900))
    nmap_host_timeout: int = field(default_factory=lambda: _int("NMAP_HOST_TIMEOUT", 900))
    nuclei_timeout: int = field(default_factory=lambda: _int("NUCLEI_TIMEOUT", 1200))
    whatweb_timeout: int = field(default_factory=lambda: _int("WHATWEB_TIMEOUT", 120))
    wafw00f_timeout: int = field(default_factory=lambda: _int("WAFW00F_TIMEOUT", 120))
    testssl_timeout: int = field(default_factory=lambda: _int("TESTSSL_TIMEOUT", 900))
    feroxbuster_timeout: int = field(default_factory=lambda: _int("FEROXBUSTER_TIMEOUT", 1200))
    nikto_timeout: int = field(default_factory=lambda: _int("NIKTO_TIMEOUT", 900))

    # True: nmap only hits IPs that are themselves in a scope 'ip'/'cidr' entry.
    # False: an in-scope hostname also authorizes the IP it resolves to.
    nmap_require_ip_scope: bool = field(default_factory=lambda: _bool("NMAP_REQUIRE_IP_SCOPE", False))

    httpx_asn: bool = field(default_factory=lambda: _bool("HTTPX_ASN", True))
    nmap_top_ports: int = field(default_factory=lambda: _int("NMAP_TOP_PORTS", 1000))
    nuclei_severity: str = field(default_factory=lambda: os.environ.get("NUCLEI_SEVERITY", "low,medium,high,critical"))
    nuclei_exclude_tags: str = field(default_factory=lambda: os.environ.get("NUCLEI_EXCLUDE_TAGS", "dos,fuzz,intrusive"))

    def tool_env(self) -> dict[str, str]:
        """Minimal, explicit environment for child processes."""
        home = os.environ.get("HOME", "/home/ubuntu")
        return {
            "PATH": f"{home}/.pdtm/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "HOME": home,
            "LANG": "C.UTF-8",
        }


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
