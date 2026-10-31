"""Local CVE database on the VM (SQLite), mirrored from NVD.

Scans never call an API for CVEs: they match product+version against this
file. A nightly systemd timer runs `python -m app.cve_db sync`, which pulls
only CVEs modified since the last sync (the first run pulls everything).

    python -m app.cve_db sync            # incremental (full on first run)
    python -m app.cve_db sync --full     # rebuild
    python -m app.cve_db lookup nginx 1.18.0
    python -m app.cve_db stats
"""

import argparse
import logging
import re
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from .config import get_settings

log = logging.getLogger(__name__)

NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
PAGE_SIZE = 500  # small pages keep peak RAM low on a 1 GB box
MAX_INCREMENTAL_DAYS = 119  # NVD caps lastMod ranges at 120 days

SCHEMA = """
create table if not exists cves (
  id text primary key, published text, last_modified text,
  cvss real, severity text, vector text, cwe text, summary text
);
create table if not exists cpe_match (
  cve_id text not null, vendor text not null, product text not null,
  version text, upd text, vsi text, vse text, vei text, vee text
);
create index if not exists cpe_match_product on cpe_match(product, vendor);
create index if not exists cpe_match_cve on cpe_match(cve_id);
create table if not exists meta (k text primary key, v text);
"""

# httpx tech / nmap product names -> (NVD vendor or None, NVD product)
ALIASES: dict[str, tuple[str | None, str]] = {
    "apache": ("apache", "http_server"),
    "apache http server": ("apache", "http_server"),
    "apache httpd": ("apache", "http_server"),
    "apache tomcat": ("apache", "tomcat"),
    "apache tomcat/coyote jsp engine": ("apache", "tomcat"),
    "tomcat": ("apache", "tomcat"),
    "nginx": (None, "nginx"),
    "openresty": ("openresty", "openresty"),
    "microsoft iis": ("microsoft", "internet_information_services"),
    "microsoft iis httpd": ("microsoft", "internet_information_services"),
    "iis": ("microsoft", "internet_information_services"),
    "microsoft asp.net": ("microsoft", "asp.net"),
    "openssh": ("openbsd", "openssh"),
    "openssl": ("openssl", "openssl"),
    "php": ("php", "php"),
    "jquery": ("jquery", "jquery"),
    "jquery ui": ("jquery", "jquery_ui"),
    "bootstrap": ("getbootstrap", "bootstrap"),
    "wordpress": ("wordpress", "wordpress"),
    "drupal": ("drupal", "drupal"),
    "joomla": ("joomla", "joomla\\!"),
    "lighttpd": ("lighttpd", "lighttpd"),
    "express": ("expressjs", "express"),
    "node.js": ("nodejs", "node.js"),
    "exim smtpd": ("exim", "exim"),
    "postfix smtpd": ("postfix", "postfix"),
    "proftpd": ("proftpd", "proftpd"),
    "vsftpd": ("vsftpd_project", "vsftpd"),
    "mysql": ("oracle", "mysql"),
    "postgresql db": ("postgresql", "postgresql"),
    "redis key-value store": ("redis", "redis"),
    "isc bind": ("isc", "bind"),
    "dovecot imapd": ("dovecot", "dovecot"),
    "grafana": ("grafana", "grafana"),
    "jenkins": ("jenkins", "jenkins"),
    "gitlab": ("gitlab", "gitlab"),
    "codeigniter": ("codeigniter", "codeigniter"),
    "laravel": ("laravel", "laravel"),
    "symfony": ("sensiolabs", "symfony"),
    "django": ("djangoproject", "django"),
    "moment.js": ("momentjs", "moment"),
    "momentjs": ("momentjs", "moment"),
    "moment": ("momentjs", "moment"),
    "lodash": ("lodash", "lodash"),
    "vue.js": ("vuejs", "vue"),
    "react": ("facebook", "react"),
    "angular": ("angular", "angular"),
    "angularjs": ("angularjs", "angular.js"),
    "asp.net": ("microsoft", "asp.net"),
    "openssl": ("openssl", "openssl"),
    "nextjs": ("vercel", "next.js"),
    "next.js": ("vercel", "next.js"),
}

_PRE_RELEASE = {"alpha", "a", "beta", "b", "rc", "pre", "preview", "dev", "snapshot", "m"}


# ---------------------------------------------------------------------------
# Version comparison (good enough for NVD-style versions: 2.4.41, 8.2p1, 1.0.2k, 3.0.0-rc1)
# ---------------------------------------------------------------------------
def _tokens(version: str) -> list[int | str]:
    return [int(t) if t.isdigit() else t for t in re.findall(r"\d+|[a-z]+", version.lower())]


def compare_versions(a: str, b: str) -> int:
    ta, tb = _tokens(a), _tokens(b)
    for x, y in zip(ta, tb):
        if x == y:
            continue
        if isinstance(x, int) and isinstance(y, int):
            return -1 if x < y else 1
        if isinstance(x, str) and isinstance(y, str):
            return -1 if x < y else 1
        # number vs word: pre-release words sort before numbers, other suffixes after.
        word = x if isinstance(x, str) else y
        word_is_less = word in _PRE_RELEASE
        if isinstance(x, str):
            return -1 if word_is_less else 1
        return 1 if word_is_less else -1
    if len(ta) == len(tb):
        return 0
    longer, sign = (ta, 1) if len(ta) > len(tb) else (tb, -1)
    nxt = longer[min(len(ta), len(tb))]
    if isinstance(nxt, str) and nxt in _PRE_RELEASE:
        return -sign  # 2.0rc1 < 2.0
    return sign  # 2.0.1 > 2.0, 8.2p1 > 8.2


def _wild(v: str | None) -> bool:
    return v in (None, "", "*", "-")


def version_matches(version: str, row: sqlite3.Row) -> bool:
    if not _wild(row["version"]):
        exact = row["version"] + ("" if _wild(row["upd"]) else row["upd"])
        return compare_versions(version, row["version"]) == 0 or compare_versions(version, exact) == 0
    bounds = [row["vsi"], row["vse"], row["vei"], row["vee"]]
    if all(_wild(b) for b in bounds):
        return False  # "all versions" entries are too noisy to report
    if not _wild(row["vsi"]) and compare_versions(version, row["vsi"]) < 0:
        return False
    if not _wild(row["vse"]) and compare_versions(version, row["vse"]) <= 0:
        return False
    if not _wild(row["vei"]) and compare_versions(version, row["vei"]) > 0:
        return False
    if not _wild(row["vee"]) and compare_versions(version, row["vee"]) >= 0:
        return False
    return True


# ---------------------------------------------------------------------------
# Lookup
# ---------------------------------------------------------------------------
def connect(path: Path | None = None, readonly: bool = False) -> sqlite3.Connection:
    path = path or get_settings().cve_db_path
    if readonly:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, timeout=30)
        conn.execute("pragma journal_mode=wal")
        conn.executescript(SCHEMA)
    conn.row_factory = sqlite3.Row
    return conn


def resolve_product(name: str, cpe: str | None = None) -> tuple[str | None, str, str | None]:
    """Return (vendor, product, version_from_cpe). Accepts nmap 'cpe:/a:v:p:ver' or cpe 2.3."""
    if cpe:
        parts = cpe.replace("cpe:2.3:", "cpe:/").split(":")
        # cpe:/a:vendor:product:version
        if len(parts) >= 4 and parts[1].endswith("a"):
            vendor, product = parts[2], parts[3]
            version = parts[4] if len(parts) > 4 and not _wild(parts[4]) else None
            return vendor, product, version
    key = name.strip().lower()
    if key in ALIASES:
        vendor, product = ALIASES[key]
        return vendor, product, None
    return None, re.sub(r"\s+", "_", key), None


def lookup(conn: sqlite3.Connection, product: str, version: str, vendor: str | None = None, limit: int = 10) -> list[dict]:
    if not product or not version:
        return []
    rows = []
    if vendor:
        rows = conn.execute("select * from cpe_match where product = ? and vendor = ?", (product, vendor)).fetchall()
    if not rows:
        # nmap often uses old vendor names (e.g. igor_sysoev for nginx): fall back to product only.
        rows = conn.execute("select * from cpe_match where product = ?", (product,)).fetchall()
    ids = {r["cve_id"] for r in rows if version_matches(version, r)}
    if not ids:
        return []
    placeholders = ",".join("?" * len(ids))
    cves = conn.execute(
        f"select * from cves where id in ({placeholders}) order by coalesce(cvss, 0) desc, id desc limit ?",
        (*ids, limit),
    ).fetchall()
    return [dict(c) for c in cves]


def is_ready(path: Path | None = None) -> bool:
    path = path or get_settings().cve_db_path
    if not path.exists():
        return False
    with connect(path, readonly=True) as conn:
        return conn.execute("select count(*) from cves").fetchone()[0] > 0


# ---------------------------------------------------------------------------
# Sync from NVD
# ---------------------------------------------------------------------------
def _metric(cve: dict) -> tuple[float | None, str | None, str | None]:
    metrics = cve.get("metrics") or {}
    for key in ("cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        for m in metrics.get(key) or []:
            data = m.get("cvssData") or {}
            score = data.get("baseScore")
            if score is None:
                continue
            severity = data.get("baseSeverity") or m.get("baseSeverity")
            return float(score), (severity or "").upper() or None, data.get("vectorString")
    return None, None, None


def _store(conn: sqlite3.Connection, item: dict) -> None:
    cve = item.get("cve") or {}
    cve_id = cve.get("id")
    if not cve_id:
        return
    conn.execute("delete from cpe_match where cve_id = ?", (cve_id,))
    if cve.get("vulnStatus") == "Rejected":
        conn.execute("delete from cves where id = ?", (cve_id,))
        return
    cvss, severity, vector = _metric(cve)
    summary = next((d.get("value") for d in cve.get("descriptions") or [] if d.get("lang") == "en"), "")
    cwe = None
    for w in cve.get("weaknesses") or []:
        for d in w.get("description") or []:
            if str(d.get("value", "")).startswith("CWE-"):
                cwe = d["value"]
                break
        if cwe:
            break
    conn.execute(
        "insert or replace into cves values (?,?,?,?,?,?,?,?)",
        (cve_id, cve.get("published"), cve.get("lastModified"), cvss, severity, vector, cwe, summary[:4000]),
    )
    for config in cve.get("configurations") or []:
        for node in config.get("nodes") or []:
            for m in node.get("cpeMatch") or []:
                if not m.get("vulnerable"):
                    continue
                parts = str(m.get("criteria", "")).split(":")
                # cpe:2.3:part:vendor:product:version:update:...
                if len(parts) < 7 or parts[2] != "a":
                    continue
                conn.execute(
                    "insert into cpe_match values (?,?,?,?,?,?,?,?,?)",
                    (cve_id, parts[3], parts[4], parts[5], parts[6],
                     m.get("versionStartIncluding"), m.get("versionStartExcluding"),
                     m.get("versionEndIncluding"), m.get("versionEndExcluding")),
                )


def _fetch(client: httpx.Client, params: dict, delay: float) -> dict:
    for attempt in range(6):
        try:
            res = client.get(NVD_URL, params=params)
            if res.status_code == 200:
                return res.json()
            log.warning("NVD %s, retrying", res.status_code)
        except httpx.HTTPError as e:
            log.warning("NVD request failed (%s), retrying", e)
        time.sleep(delay * (attempt + 2) + 10)
    raise RuntimeError("NVD unavailable after retries")


def sync(full: bool = False) -> int:
    s = get_settings()
    delay = 0.7 if s.nvd_api_key else 6.5  # NVD: 50 req/30s with key, 5 req/30s without
    headers = {"apiKey": s.nvd_api_key} if s.nvd_api_key else {}
    now = datetime.now(timezone.utc)
    conn = connect()
    last = conn.execute("select v from meta where k = 'last_sync'").fetchone()
    base: dict = {"resultsPerPage": PAGE_SIZE}
    if not full and last:
        since = datetime.fromisoformat(last["v"])
        if now - since > timedelta(days=MAX_INCREMENTAL_DAYS):
            full = True
        else:
            base["lastModStartDate"] = since.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")
            base["lastModEndDate"] = now.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")
    elif not last:
        full = True
    log.info("NVD sync starting (%s)", "full" if full else f"since {last['v']}")

    total, start = None, 0
    with httpx.Client(headers=headers, timeout=60) as client:
        while total is None or start < total:
            data = _fetch(client, {**base, "startIndex": start}, delay)
            total = int(data.get("totalResults", 0))
            items = data.get("vulnerabilities") or []
            with conn:
                for item in items:
                    _store(conn, item)
            start += len(items) or PAGE_SIZE
            log.info("NVD sync %d/%d", min(start, total), total)
            if start < total:
                time.sleep(delay)

    with conn:
        conn.execute("insert or replace into meta values ('last_sync', ?)", (now.isoformat(),))
    conn.close()
    return total or 0


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="python -m app.cve_db")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_sync = sub.add_parser("sync")
    p_sync.add_argument("--full", action="store_true")
    p_look = sub.add_parser("lookup")
    p_look.add_argument("product")
    p_look.add_argument("version")
    sub.add_parser("stats")
    args = parser.parse_args()

    if args.cmd == "sync":
        print(f"synced {sync(full=args.full)} CVEs")
    elif args.cmd == "lookup":
        vendor, product, _ = resolve_product(args.product)
        with connect(readonly=True) as conn:
            for c in lookup(conn, product, args.version, vendor, limit=25):
                print(f"{c['id']:18} {c['cvss'] or '-':>4} {c['severity'] or '':9} {c['summary'][:90]}")
    elif args.cmd == "stats":
        with connect(readonly=True) as conn:
            n = conn.execute("select count(*) from cves").fetchone()[0]
            m = conn.execute("select count(*) from cpe_match").fetchone()[0]
            last = conn.execute("select v from meta where k = 'last_sync'").fetchone()
        print(f"{n} CVEs, {m} CPE match rows, last sync {last['v'] if last else 'never'}")


if __name__ == "__main__":
    sys.exit(main())
