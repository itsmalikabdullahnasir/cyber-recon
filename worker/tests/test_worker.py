import json
import os
import uuid
from pathlib import Path

import pytest

os.environ.setdefault("WORKER_SECRET", "test-secret")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "service-key")

from app import cve_db  # noqa: E402
from app.runners import http_probe, nmap, nuclei  # noqa: E402
from app.scope import Scope  # noqa: E402
from app.validation import InvalidTarget, parse_target  # noqa: E402


# --- validation -----------------------------------------------------------
@pytest.mark.parametrize("value,expected", [
    ("Example.COM", ("domain", "example.com")),
    ("sub.example.co.uk.", ("domain", "sub.example.co.uk")),
    ("8.8.8.8", ("ip", "8.8.8.8")),
    ("2606:4700:4700::1111", ("ip", "2606:4700:4700::1111")),
    ("bücher.de", ("domain", "xn--bcher-kva.de")),
])
def test_valid_targets(value, expected):
    assert parse_target(value) == expected


@pytest.mark.parametrize("value", [
    "example.com; rm -rf /", "-oN/tmp/x", "$(id).example.com", "exa mple.com",
    "127.0.0.1", "10.0.0.5", "169.254.169.254", "192.168.1.1", "::1",
    "localhost", "example", "http://example.com", "a" * 300, "", "example.123",
])
def test_invalid_targets(value):
    with pytest.raises(InvalidTarget):
        parse_target(value)


# --- scope ----------------------------------------------------------------
def _scope(target_scope="In Scope"):
    return Scope.from_rows(target_scope, [
        {"kind": "domain", "value": "example.com"},
        {"kind": "wildcard", "value": "*.app.example.com"},
        {"kind": "cidr", "value": "203.0.113.0/24"},
        {"kind": "ip", "value": "198.51.100.7"},
        {"kind": "cidr", "value": "not-a-network"},
    ])


def test_scope_matching():
    s = _scope()
    assert s.hostname_allowed("example.com")
    assert not s.hostname_allowed("www.example.com")  # only exact domain entry
    assert s.hostname_allowed("x.app.example.com")
    assert not s.hostname_allowed("app.example.com")  # wildcard excludes apex
    assert not s.hostname_allowed("evilapp.example.com")
    assert s.ip_allowed("203.0.113.99")
    assert s.ip_allowed("198.51.100.7")
    assert not s.ip_allowed("198.51.100.8")
    assert s.host_allowed("nope.test", "203.0.113.1")


def test_out_of_scope_target_blocks_everything():
    s = _scope("Out of Scope")
    assert not s.hostname_allowed("example.com")
    assert not s.ip_allowed("203.0.113.1")


# --- versions -------------------------------------------------------------
@pytest.mark.parametrize("a,b,expected", [
    ("2.4.41", "2.4.41", 0), ("2.4.41", "2.4.9", 1), ("1.18.0", "1.20", -1),
    ("8.2p1", "8.2", 1), ("8.2p1", "8.3", -1), ("1.0.2k", "1.0.2", 1),
    ("2.0rc1", "2.0", -1), ("3.0.0-beta1", "3.0.0", -1), ("10.0", "9.9.9", 1),
])
def test_compare_versions(a, b, expected):
    assert cve_db.compare_versions(a, b) == expected


# --- parsers ----------------------------------------------------------------
NMAP_XML = """<?xml version="1.0"?>
<nmaprun><host><address addr="93.184.216.34" addrtype="ipv4"/><ports>
<port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH" version="8.2p1 Ubuntu 4ubuntu0.5" ostype="Linux"><cpe>cpe:/a:openbsd:openssh:8.2p1</cpe><cpe>cpe:/o:linux:linux_kernel</cpe></service></port>
<port protocol="tcp" portid="80"><state state="open"/><service name="http" product="nginx" version="1.18.0"><cpe>cpe:/a:igor_sysoev:nginx:1.18.0</cpe></service></port>
<port protocol="tcp" portid="25"><state state="filtered"/><service name="smtp"/></port>
</ports></host></nmaprun>"""


def test_nmap_parse(tmp_path):
    p = tmp_path / "n.xml"
    p.write_text(NMAP_XML)
    r = nmap.parse_xml(p)
    assert [x["port"] for x in r["ports"]] == [22, 80]
    assert r["ports"][0]["cpe"][0] == "cpe:/a:openbsd:openssh:8.2p1"
    assert r["os"] == "Linux"


def test_nmap_rejects_billion_laughs(tmp_path):
    p = tmp_path / "evil.xml"
    p.write_text('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><nmaprun>&a;</nmaprun>')
    with pytest.raises(Exception):
        nmap.parse_xml(p)


def test_nuclei_parse():
    r = nuclei.parse_result({
        "template-id": "CVE-2021-41773", "host": "https://a.example.com", "matched-at": "https://a.example.com/cgi-bin/",
        "info": {"name": "Apache 2.4.49 Path Traversal", "severity": "critical",
                 "classification": {"cve-id": ["cve-2021-41773"], "cwe-id": ["cwe-22"], "cvss-score": 7.5}},
    })
    assert r["cve"] == "CVE-2021-41773" and r["cwe"] == "CWE-22" and r["severity"] == "critical"


def test_tech_versions():
    assert http_probe.tech_versions(["Nginx:1.18.0", "Cloudflare", "PHP:7.4.3", "jQuery:x"]) == [
        ("nginx", "1.18.0"), ("php", "7.4.3")]


# --- local CVE DB -------------------------------------------------------------
NVD_ITEM = {"cve": {
    "id": "CVE-2021-23017", "published": "2021-06-01", "lastModified": "2023-01-01", "vulnStatus": "Analyzed",
    "descriptions": [{"lang": "en", "value": "nginx resolver off-by-one"}],
    "metrics": {"cvssMetricV31": [{"cvssData": {"baseScore": 7.7, "baseSeverity": "HIGH", "vectorString": "AV:N"}}]},
    "weaknesses": [{"description": [{"lang": "en", "value": "CWE-193"}]}],
    "configurations": [{"nodes": [{"cpeMatch": [
        {"vulnerable": True, "criteria": "cpe:2.3:a:f5:nginx:*:*:*:*:*:*:*:*",
         "versionStartIncluding": "0.6.18", "versionEndExcluding": "1.20.1"},
    ]}]}],
}}
SSH_ITEM = {"cve": {
    "id": "CVE-2020-15778", "vulnStatus": "Analyzed",
    "descriptions": [{"lang": "en", "value": "scp command injection"}],
    "metrics": {"cvssMetricV31": [{"cvssData": {"baseScore": 7.8, "baseSeverity": "HIGH"}}]},
    "configurations": [{"nodes": [{"cpeMatch": [
        {"vulnerable": True, "criteria": "cpe:2.3:a:openbsd:openssh:*:*:*:*:*:*:*:*", "versionEndIncluding": "8.3"},
    ]}]}],
}}


@pytest.fixture
def cvedb(tmp_path, monkeypatch):
    path = tmp_path / "cve.sqlite3"
    monkeypatch.setattr(cve_db, "get_settings", lambda: type("S", (), {"cve_db_path": path})())
    conn = cve_db.connect(path)
    with conn:
        cve_db._store(conn, NVD_ITEM)
        cve_db._store(conn, SSH_ITEM)
    conn.close()
    return path


def test_cve_lookup(cvedb):
    conn = cve_db.connect(cvedb, readonly=True)
    vendor, product, version = cve_db.resolve_product("nginx", "cpe:/a:igor_sysoev:nginx:1.18.0")
    assert (vendor, product, version) == ("igor_sysoev", "nginx", "1.18.0")
    hits = cve_db.lookup(conn, product, version, vendor)  # vendor miss -> product fallback
    assert [h["id"] for h in hits] == ["CVE-2021-23017"]
    assert hits[0]["severity"] == "HIGH" and hits[0]["cwe"] == "CWE-193"
    assert cve_db.lookup(conn, "nginx", "1.20.1") == []
    assert [h["id"] for h in cve_db.lookup(conn, "openssh", "8.2p1", "openbsd")] == ["CVE-2020-15778"]
    assert cve_db.is_ready(cvedb)


# --- full pipeline with fake tools + fake Supabase ------------------------------
class FakeDB:
    def __init__(self, scope_rows, target_scope="In Scope"):
        scope_rows = [{"target_id": "t1", **r} for r in scope_rows]
        self.tables = {"targets": [{"id": "t1", "scope": target_scope}], "scope_entries": scope_rows,
                       "subdomains": [], "hosts": [], "findings": [], "notifications": [], "activities": [],
                       "scans": []}

    @staticmethod
    def _match(row, filters):
        for k, v in filters.items():
            op, _, val = v.partition(".")
            if op == "eq" and str(row.get(k)) != val:
                return False
            if op == "in" and str(row.get(k)) not in val.strip("()").split(","):
                return False
        return True

    def select(self, table, filters, columns="*"):
        ctrl = {k: filters[k] for k in ("order", "limit", "offset", "select") if k in filters}
        flt = {k: v for k, v in filters.items() if k not in ("order", "limit", "offset", "select")}
        rows = [dict(r) for r in self.tables[table] if self._match(r, flt)]
        if "order" in ctrl:
            key, _, direction = ctrl["order"].partition(".")
            rows.sort(key=lambda r: r.get(key) or "", reverse=direction == "desc")
        if "limit" in ctrl:
            rows = rows[: int(ctrl["limit"])]
        return rows

    def insert(self, table, rows, on_conflict=None, ignore_duplicates=False):
        out = []
        for r in rows if isinstance(rows, list) else [rows]:
            if on_conflict:
                existing = [x for x in self.tables[table] if x.get(on_conflict) == r.get(on_conflict)]
                if existing:
                    if not ignore_duplicates:
                        existing[0].update(r)
                        out.append(dict(existing[0]))
                    continue
            r = {"id": str(uuid.uuid4()), **r}
            self.tables[table].append(r)
            out.append(dict(r))
        return out

    def update(self, table, filters, values):
        out = []
        for r in self.tables[table]:
            if self._match(r, filters):
                r.update(values)
                out.append(dict(r))
        return out

    def notify(self, email, title, message, target_id):
        self.tables["notifications"].append({"title": title, "message": message})

    def activity(self, target_id, action, detail):
        self.tables["activities"].append({"action": action})


@pytest.fixture
def fake_tools(monkeypatch, tmp_path, cvedb):
    from app import pipeline
    from app.runners import dnsx, feroxbuster, nikto, subfinder, testssl, wafw00f, whatweb

    calls = {"nmap": [], "nuclei": [], "ferox": [], "testssl": [], "nikto": [], "whatweb": []}
    monkeypatch.setattr(pipeline, "get_settings", lambda: type("S", (), {
        "results_dir": tmp_path, "max_heavy_hosts": 20, "cve_max_per_product": 10, "nmap_require_ip_scope": False,
        "enable_whatweb": True, "enable_wafw00f": True, "enable_testssl": True,
        "enable_feroxbuster": True, "enable_nikto": False,
    })())

    monkeypatch.setattr(whatweb, "run", lambda url, w, n: (calls["whatweb"].append(url) or [("PHP", "7.4.3")]))
    monkeypatch.setattr(wafw00f, "run", lambda url, w, n: "ModSecurity" if "other" not in url else None)
    monkeypatch.setattr(testssl, "run", lambda host, w, n: (calls["testssl"].append(host) or
                        [{"id": "BREACH", "severity": "LOW", "finding": "potentially vulnerable", "cve": None}]))
    monkeypatch.setattr(feroxbuster, "run", lambda url, w, n: (calls["ferox"].append(url) or
                        [{"path": "/admin", "url": url + "/admin", "status": 403, "length": 12}]))
    monkeypatch.setattr(nikto, "run", lambda url, w, n: calls["nikto"].append(url) or [])
    monkeypatch.setattr(subfinder, "run", lambda d, w: [{"name": n, "sources": ["crtsh"]} for n in
                                                         ["example.com", "www.example.com", "cdn.example.com", "dead.example.com", "other.example.com"]])
    monkeypatch.setattr(dnsx, "run", lambda names, w: {
        "example.com": {"ips": ["93.184.216.34"], "cdn_name": None},
        "www.example.com": {"ips": ["93.184.216.34"], "cdn_name": None},
        "cdn.example.com": {"ips": ["104.16.1.1"], "cdn_name": "cloudflare"},
        "other.example.com": {"ips": ["8.8.4.4"], "cdn_name": None},
    })

    def probe(names, w):
        base = {"scheme": "https", "status_code": 200, "title": "t", "webserver": "nginx", "asn": "AS1 Test",
                "is_cdn": False, "cdn_name": None}
        return {
            "example.com": {**base, "url": "https://example.com", "tech": ["Nginx:1.18.0"], "ips": ["93.184.216.34"]},
            "www.example.com": {**base, "url": "https://www.example.com", "tech": ["Nginx:1.18.0"], "ips": ["93.184.216.34"]},
            "cdn.example.com": {**base, "url": "https://cdn.example.com", "tech": ["Cloudflare"], "ips": ["104.16.1.1"],
                                "is_cdn": True, "cdn_name": "cloudflare"},
            "other.example.com": {**base, "url": "https://other.example.com", "tech": [], "ips": ["8.8.4.4"]},
        }, None

    monkeypatch.setattr(http_probe, "run", probe)

    def fake_nmap(ip, w):
        calls["nmap"].append(ip)
        p = Path(w) / "n.xml"
        p.write_text(NMAP_XML)
        return nmap.parse_xml(p)

    monkeypatch.setattr(nmap, "run", fake_nmap)

    def fake_nuclei(urls, w):
        calls["nuclei"].extend(urls)
        return [nuclei.parse_result({"template-id": "tls-weak", "host": "https://example.com",
                                     "matched-at": "example.com:443", "ip": "93.184.216.34",
                                     "info": {"name": "Weak TLS", "severity": "medium"}})]

    monkeypatch.setattr(nuclei, "run", fake_nuclei)
    return calls


def _scan(mode="full"):
    return {"id": "s1", "target_id": "t1", "mode": mode, "input": "example.com", "requested_by_email": "me@x.io", "stages": {}}


def test_full_pipeline_respects_scope_and_cdn(fake_tools):
    from app.pipeline import Pipeline

    db = FakeDB([{"kind": "domain", "value": "example.com"}, {"kind": "domain", "value": "www.example.com"},
                 {"kind": "domain", "value": "cdn.example.com"}])
    db.tables["scans"].append(_scan())
    Pipeline(db, _scan()).run()

    scan = db.tables["scans"][0]
    assert scan["status"] == "done", scan
    subs = {s["name"]: s for s in db.tables["subdomains"]}
    assert subs["dead.example.com"]["status"] == "Inactive"
    assert subs["cdn.example.com"]["is_cdn"] is True
    # nmap: in-scope, non-CDN only. other.example.com (8.8.4.4) is out of scope, cdn is CDN.
    assert fake_tools["nmap"] == ["93.184.216.34"]
    assert scan["stages"]["nmap"]["skipped_cdn"] == 1
    assert scan["stages"]["nmap"]["skipped_out_of_scope"] == 1
    # nuclei only gets in-scope hostnames
    assert "https://other.example.com" not in fake_tools["nuclei"]
    host = next(h for h in db.tables["hosts"] if h["ip"] == "93.184.216.34")
    assert [p["port"] for p in host["ports"]] == [22, 80]
    cves = {f["cve_id"] for f in db.tables["findings"] if f["source"] == "cve-local"}
    assert cves == {"CVE-2021-23017", "CVE-2020-15778"}
    assert any(f["source"] == "nuclei" for f in db.tables["findings"])
    titles = [n["title"] for n in db.tables["notifications"]]
    assert titles == ["🛰️ Scan started — example.com", "✅ Scan complete — example.com"]

    # New tool stages. whatweb/wafw00f are passive (run on all 4 probed hosts),
    # while testssl/feroxbuster are active and only hit the 3 in-scope hosts.
    assert len(fake_tools["whatweb"]) == 4
    assert host["waf"] == "ModSecurity"
    assert "PHP:7.4.3" in host["tech"]
    # Active web tools run on in-scope, NON-CDN hosts only: example.com + www
    # (both non-CDN). cdn.example.com is in scope but CDN -> skipped.
    assert len(fake_tools["testssl"]) == 2 and len(fake_tools["ferox"]) == 2
    assert "https://other.example.com" not in fake_tools["ferox"]  # out of scope, never dir-scanned
    assert "https://cdn.example.com" not in fake_tools["ferox"]  # CDN edge, skipped
    assert host["dirs"][0]["path"] == "/admin"
    assert any(f["source"] == "testssl" for f in db.tables["findings"])
    dir_findings = [f for f in db.tables["findings"] if f["source"] == "feroxbuster"]
    assert dir_findings and dir_findings[0]["severity"] == "Low"
    assert scan["stages"]["nikto"]["status"] == "skipped"  # disabled by default

    # Re-run: findings are not duplicated, and a user's status change survives.
    db.tables["findings"][0]["status"] = "False Positive"
    count = len(db.tables["findings"])
    db.tables["scans"][0].update(status="queued")
    Pipeline(db, _scan()).run()
    assert len(db.tables["findings"]) == count
    assert db.tables["findings"][0]["status"] == "False Positive"


def test_active_stages_refused_without_scope(fake_tools):
    from app.pipeline import Pipeline

    db = FakeDB([])
    db.tables["scans"].append(_scan())
    Pipeline(db, _scan()).run()
    scan = db.tables["scans"][0]
    assert scan["status"] == "done"
    assert scan["stages"]["nmap"]["status"] == "refused"
    assert scan["stages"]["nuclei"]["status"] == "refused"
    assert fake_tools["nmap"] == [] and fake_tools["nuclei"] == []
    assert db.tables["subdomains"]  # passive stages still ran


def test_out_of_scope_target_refused(fake_tools):
    from app.pipeline import Pipeline

    db = FakeDB([{"kind": "domain", "value": "example.com"}], target_scope="Out of Scope")
    db.tables["scans"].append(_scan())
    Pipeline(db, _scan()).run()
    assert db.tables["scans"][0]["stages"]["nmap"]["status"] == "refused"
    assert fake_tools["nmap"] == []


def test_passive_mode_never_runs_active(fake_tools):
    from app.pipeline import Pipeline

    db = FakeDB([{"kind": "domain", "value": "example.com"}])
    db.tables["scans"].append(_scan("passive"))
    Pipeline(db, _scan("passive")).run()
    assert fake_tools["nmap"] == [] and fake_tools["nuclei"] == []
    assert db.tables["scans"][0]["stages"]["nmap"]["status"] == "skipped"


# --- persistent queue (poller) -------------------------------------------------
def test_poller_claims_oldest_and_counts(monkeypatch):
    from app import jobs

    db = FakeDB([])
    for i, ts in enumerate(["2026-01-01", "2026-01-02", "2026-01-03"]):
        db.tables["scans"].append({
            "id": f"s{i}", "target_id": "t1", "mode": "passive", "input": "example.com",
            "status": "queued", "created_at": ts, "stages": {},
        })
    wrapper = type("D", (), {"select": db.select, "update": db.update, "close": lambda s=None: None})()
    monkeypatch.setattr(jobs, "Supabase", lambda: wrapper)

    assert jobs.pending_count() == 3
    p = jobs.Poller()
    claimed = p._claim_next()
    assert claimed["id"] == "s0" and claimed["status"] == "running"  # oldest first
    # s0 now running, s1/s2 still queued -> 3 pending (queued+running)
    assert jobs.pending_count() == 3
    # Claiming again skips the running one and takes the next oldest queued.
    assert p._claim_next()["id"] == "s1"

    # recover_stale fails running scans but leaves queued ones intact.
    jobs.recover_stale()
    statuses = {r["id"]: r["status"] for r in db.tables["scans"]}
    assert statuses["s0"] == "failed" and statuses["s1"] == "failed" and statuses["s2"] == "queued"


# --- API -----------------------------------------------------------------------
def test_api_secret_and_validation(monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    monkeypatch.setattr(main, "recover_stale", lambda: None)
    monkeypatch.setattr(main.get_settings(), "results_dir", Path(os.environ.get("TMPDIR", "/tmp")), raising=False) \
        if False else None
    sid = str(uuid.uuid4())
    db = FakeDB([])
    db.tables["scans"].append({"id": sid, "target_id": "t1", "mode": "passive", "input": "example.com",
                               "status": "queued", "stages": {}})
    monkeypatch.setattr(main, "Supabase", lambda: type("D", (), {"select": db.select, "close": lambda self=None: None})())
    # Don't start a real polling thread in the test.
    monkeypatch.setattr(main, "Poller", lambda: type("P", (), {"start": lambda s: None, "stop": lambda s: None, "current": None})())
    monkeypatch.setattr(main, "pending_count", lambda: 0)
    monkeypatch.setenv("RESULTS_DIR", "/tmp/recon-test")
    main.get_settings.__globals__["_settings"] = None

    with TestClient(main.app) as client:
        body = {"target": "example.com", "scan_id": sid, "mode": "passive"}
        assert client.post("/scan", json=body).status_code == 401
        assert client.post("/scan", json=body, headers={"X-Worker-Secret": "wrong"}).status_code == 401
        bad = {**body, "target": "example.com;id"}
        assert client.post("/scan", json=bad, headers={"X-Worker-Secret": "test-secret"}).status_code == 400
        mismatch = {**body, "mode": "full"}
        assert client.post("/scan", json=mismatch, headers={"X-Worker-Secret": "test-secret"}).status_code == 400
        r = client.post("/scan", json=body, headers={"X-Worker-Secret": "test-secret"})
        assert r.status_code == 202 and r.json()["status"] == "accepted"
        assert client.get("/health").json() == {"ok": True, "pending": 0}
        assert client.get("/docs").status_code == 404
