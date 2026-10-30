"""The scan pipeline. Runs in the single worker thread, one scan at a time.

passive: subfinder -> dnsx -> httpx (+CDN flag) -> CVE match on httpx tech
full:    passive + [scope gate] nmap -> CVE match on nmap versions -> nuclei
"""

import hashlib
import logging
from collections import defaultdict
from datetime import date
from pathlib import Path

from . import cve_db
from .config import get_settings
from .proc import ToolError
from .runners import dnsx, http_probe, nmap, nuclei, subfinder
from .scope import Scope
from .supa import Supabase, now_iso
from .validation import normalize_public_ip, parse_target

log = logging.getLogger(__name__)

SEVERITY_MAP = {
    "critical": "Critical", "high": "High", "medium": "Medium",
    "moderate": "Medium", "low": "Low", "info": "Info", "none": "Info", "unknown": "Info",
}
SEVERITY_RANK = {"Info": 0, "Low": 1, "Medium": 2, "High": 3, "Critical": 4}


def app_severity(value: str | None) -> str:
    return SEVERITY_MAP.get(str(value or "").lower(), "Info")


class ScanRefused(Exception):
    pass


class Pipeline:
    def __init__(self, db: Supabase, scan: dict) -> None:
        self.db = db
        self.scan = scan
        self.scan_id: str = scan["id"]
        self.target_id: str = scan["target_id"]
        self.mode: str = scan["mode"]
        self.email: str | None = scan.get("requested_by_email")
        self.stages: dict = dict(scan.get("stages") or {})
        self.s = get_settings()
        self.workdir: Path = self.s.results_dir / self.scan_id
        # name -> subdomain row, ip -> host row (kept in sync with the DB)
        self.subs: dict[str, dict] = {}
        self.hosts: dict[str, dict] = {}
        self.findings_new = 0

    # -- bookkeeping ---------------------------------------------------------
    def stage(self, name: str, status: str, **info) -> None:
        self.stages[name] = {"status": status, "at": now_iso(), **info}
        log.info("scan %s stage %s %s %s", self.scan_id, name, status, info)
        self.db.update("scans", {"id": f"eq.{self.scan_id}"}, {"stage": name, "stages": self.stages})

    # -- entry point ---------------------------------------------------------
    def run(self) -> None:
        self.workdir.mkdir(parents=True, exist_ok=True)
        self.db.update("scans", {"id": f"eq.{self.scan_id}"}, {"status": "running", "started_at": now_iso()})
        self.db.notify(self.email, "Recon scan started", f"{self.mode} scan of {self.scan['input']}", self.target_id)
        try:
            self._run()
        except Exception as e:
            log.exception("scan %s failed", self.scan_id)
            self.db.update("scans", {"id": f"eq.{self.scan_id}"},
                           {"status": "failed", "error": str(e)[:1000], "finished_at": now_iso(), "stages": self.stages})
            self.db.notify(self.email, "Recon scan failed", f"{self.scan['input']}: {str(e)[:300]}", self.target_id)
            self.db.activity(self.target_id, "Recon scan failed", f"{self.scan['input']}: {str(e)[:300]}")
            return

        live = sum(1 for h in self.hosts.values() if h.get("status") == "Live")
        summary = (f"{self.scan['input']}: {len(self.subs)} subdomains, {live} live hosts, "
                   f"{self.findings_new} new findings")
        self.db.update("scans", {"id": f"eq.{self.scan_id}"},
                       {"status": "done", "stage": "done", "finished_at": now_iso(), "stages": self.stages})
        self.db.notify(self.email, "Recon scan finished", summary, self.target_id)
        self.db.activity(self.target_id, f"Recon scan ({self.mode}) finished", summary)

    def _run(self) -> None:
        kind, value = parse_target(self.scan["input"])
        targets = self.db.select("targets", {"id": f"eq.{self.target_id}"}, "id,scope")
        if not targets:
            raise ScanRefused("target not found")
        scope = Scope.from_rows(
            targets[0].get("scope"),
            self.db.select("scope_entries", {"target_id": f"eq.{self.target_id}"}, "kind,value"),
        )
        self._load_existing()

        # a + b: subdomains and DNS (domains only)
        if kind == "domain":
            self.stage("subfinder", "running")
            found = subfinder.run(value, self.workdir)
            self._upsert_subdomains(found)
            self.stage("subfinder", "done", count=len(found))

            self.stage("dnsx", "running")
            resolved = dnsx.run([f["name"] for f in found], self.workdir)
            self._apply_dns(resolved)
            self.stage("dnsx", "done", count=len(resolved), unresolved=len(found) - len(resolved))
            probe_inputs = sorted(resolved)
        else:
            self.stage("subfinder", "skipped", detail="input is an IP")
            self.stage("dnsx", "skipped", detail="input is an IP")
            resolved = {}
            probe_inputs = [value]

        # c + d: httpx + CDN flag -> hosts
        self.stage("httpx", "running")
        probes, warning = http_probe.run(probe_inputs, self.workdir)
        self._apply_probes(probes, resolved)
        if kind == "ip" and value not in probes:
            # No HTTP answer. Still record it; nmap decides whether anything is open.
            self._upsert_hosts({value: {"status": "Filtered"}})
        cdn = sum(1 for p in probes.values() if p["is_cdn"])
        self.stage("httpx", "done", live=len(probes), cdn=cdn, **({"warning": warning} if warning else {}))

        # f (passive part): CVEs from httpx tech versions
        cve_ready = cve_db.is_ready()
        if cve_ready:
            self.stage("cve", "running", source="httpx")
            n = self._cves_from_tech(probes)
            self.stage("cve", "done" if self.mode == "passive" else "running", count=n, source="httpx")
        else:
            self.stage("cve", "skipped", detail="local CVE DB not synced yet: run `python -m app.cve_db sync`")

        if self.mode != "full":
            self.stage("nmap", "skipped", detail="passive mode")
            self.stage("nuclei", "skipped", detail="passive mode")
            return

        # ---- SCOPE GATE: nothing below runs on out-of-scope hosts ----------
        if not scope.target_in_scope:
            reason = "target is marked Out of Scope"
            self.stage("nmap", "refused", detail=reason)
            self.stage("nuclei", "refused", detail=reason)
            return
        if scope.empty:
            reason = "no scope entries for this target"
            self.stage("nmap", "refused", detail=reason)
            self.stage("nuclei", "refused", detail=reason)
            return

        # e: nmap
        names_by_ip: dict[str, list[str]] = defaultdict(list)
        for name, p in probes.items():
            for ip in p["ips"]:
                names_by_ip[ip].append(name)
        allowed, skipped_cdn, skipped_scope = [], [], []
        for ip in sorted(self.hosts):
            host = self.hosts[ip]
            if host.get("scan_id") != self.scan_id or not normalize_public_ip(ip):
                continue  # only hosts this scan found, never older manual rows
            if host.get("status") != "Live" and not (kind == "ip" and ip == value):
                continue
            if host.get("is_cdn"):
                skipped_cdn.append(ip)
                continue
            ok = scope.ip_allowed(ip) if self.s.nmap_require_ip_scope else (
                scope.ip_allowed(ip) or any(scope.hostname_allowed(n) for n in names_by_ip.get(ip, []))
            )
            (allowed if ok else skipped_scope).append(ip)
        capped = allowed[self.s.max_heavy_hosts:]
        allowed = allowed[: self.s.max_heavy_hosts]

        self.stage("nmap", "running", queued=len(allowed), skipped_cdn=len(skipped_cdn),
                   skipped_out_of_scope=len(skipped_scope), skipped_cap=len(capped))
        errors = []
        for i, ip in enumerate(allowed, 1):
            try:
                result = nmap.run(ip, self.workdir)
            except ToolError as e:
                errors.append(f"{ip}: {e}")
                continue
            self._apply_nmap(ip, result)
            self.stage("nmap", "running", done=i, queued=len(allowed), skipped_cdn=len(skipped_cdn),
                       skipped_out_of_scope=len(skipped_scope), skipped_cap=len(capped))
        self.stage("nmap", "done", scanned=len(allowed) - len(errors), skipped_cdn=len(skipped_cdn),
                   skipped_out_of_scope=len(skipped_scope), skipped_cap=len(capped),
                   **({"errors": errors[:10]} if errors else {}))

        # f (active part): CVEs from nmap versions
        if cve_ready:
            n = self._cves_from_nmap(allowed)
            self.stage("cve", "done", count=self.stages.get("cve", {}).get("count", 0) + n, source="httpx+nmap")

        # g: nuclei, only on in-scope hostnames / IPs
        urls = []
        for name, p in sorted(probes.items()):
            if scope.hostname_allowed(name) or any(scope.ip_allowed(ip) for ip in p["ips"]):
                urls.append(self._url_for(name, p))
        urls = urls[: self.s.max_heavy_hosts]
        self.stage("nuclei", "running", urls=len(urls))
        results = nuclei.run(urls, self.workdir)
        n = self._apply_nuclei(results, probes)
        self.stage("nuclei", "done", urls=len(urls), findings=n)

    # -- DB writes -----------------------------------------------------------
    def _load_existing(self) -> None:
        for row in self.db.select("subdomains", {"target_id": f"eq.{self.target_id}"}):
            self.subs.setdefault(row["name"].lower(), row)
        for row in self.db.select("hosts", {"target_id": f"eq.{self.target_id}"}):
            self.hosts.setdefault(row["ip"], row)

    def _write_subs(self, updates: dict[str, dict]) -> None:
        """updates: name -> columns. Inserts new names, upserts existing by id."""
        new = [{"target_id": self.target_id, "name": n, **cols} for n, cols in updates.items() if n not in self.subs]
        old = [{"id": self.subs[n]["id"], "target_id": self.target_id, "name": n, **cols}
               for n, cols in updates.items() if n in self.subs]
        for batch, conflict in ((new, None), (old, "id")):
            for keys in {tuple(sorted(r)) for r in batch}:
                rows = [r for r in batch if tuple(sorted(r)) == keys]
                for chunk in range(0, len(rows), 200):
                    for row in self.db.insert("subdomains", rows[chunk:chunk + 200], on_conflict=conflict):
                        self.subs[row["name"].lower()] = row

    def _upsert_subdomains(self, found: list[dict]) -> None:
        self._write_subs({
            f["name"]: {"scan_id": self.scan_id, "last_seen": now_iso(),
                        "discovered_by": ("subfinder: " + ", ".join(f["sources"]))[:200]}
            for f in found
        })

    def _apply_dns(self, resolved: dict[str, dict]) -> None:
        updates = {}
        for name in list(self.subs):
            if self.subs[name].get("scan_id") != self.scan_id:
                continue
            r = resolved.get(name)
            updates[name] = {
                "status": "Active" if r else "Inactive",
                "ip": r["ips"][0] if r else None,
                "resolved_ips": r["ips"] if r else None,
            }
        self._write_subs(updates)

    def _apply_probes(self, probes: dict[str, dict], resolved: dict[str, dict]) -> None:
        sub_updates, host_updates = {}, {}
        for name, p in probes.items():
            dns_cdn = (resolved.get(name) or {}).get("cdn_name")
            is_cdn = p["is_cdn"] or bool(dns_cdn)
            cdn_name = p["cdn_name"] or dns_cdn
            sub_updates[name] = {
                "url": p["url"], "http_status": p["status_code"], "http_title": p["title"],
                "webserver": p["webserver"], "tech": p["tech"], "asn": p["asn"],
                "is_cdn": is_cdn, "cdn_name": cdn_name,
                "services": ", ".join(p["tech"])[:500] or None,
            }
            for ip in p["ips"] or (resolved.get(name) or {}).get("ips", []):
                h = host_updates.setdefault(ip, {"status": "Live", "hostname": name, "tech": set(),
                                                 "is_cdn": False, "cdn_name": None, "asn": None, "http_title": None})
                h["tech"].update(p["tech"])
                h["is_cdn"] = h["is_cdn"] or is_cdn
                h["cdn_name"] = h["cdn_name"] or cdn_name
                h["asn"] = h["asn"] or p["asn"]
                h["http_title"] = h["http_title"] or p["title"]
        self._write_subs({n: u for n, u in sub_updates.items() if n in self.subs})
        for h in host_updates.values():
            h["tech"] = sorted(h["tech"])
        self._upsert_hosts(host_updates)

    def _upsert_hosts(self, updates: dict[str, dict]) -> None:
        today = date.today().isoformat()
        for ip, cols in updates.items():
            cols = {**cols, "scan_id": self.scan_id, "last_scanned": today}
            if ip in self.hosts:
                rows = self.db.update("hosts", {"id": f"eq.{self.hosts[ip]['id']}"}, cols)
            else:
                rows = self.db.insert("hosts", {"target_id": self.target_id, "ip": ip,
                                                "checked_by": "recon-worker", **cols})
            if rows:
                self.hosts[ip] = rows[0]

    def _apply_nmap(self, ip: str, result: dict) -> None:
        ports = result["ports"]
        services = [" ".join(x for x in (p["product"], p["version"]) if x) or (p["service"] or "") for p in ports]
        self._upsert_hosts({ip: {
            "ports": ports,
            "open_ports": ", ".join(f"{p['port']}/{p['protocol']}" for p in ports)[:1000] or None,
            "services": "; ".join(f"{p['port']} {s}" for p, s in zip(ports, services) if s)[:2000] or None,
            "os_guess": result["os"] or self.hosts.get(ip, {}).get("os_guess"),
            "status": "Live" if ports else self.hosts.get(ip, {}).get("status", "Filtered"),
        }})

    def _save_findings(self, rows: list[dict]) -> int:
        """Insert findings, skipping fingerprints that already exist (keeps user edits like 'False Positive')."""
        if not rows:
            return 0
        for r in rows:
            r["fingerprint"] = hashlib.sha256(r["fingerprint"].encode()).hexdigest()
        rows = list({r["fingerprint"]: r for r in rows}.values())
        existing = set()
        for chunk in range(0, len(rows), 50):
            fps = ",".join(r["fingerprint"] for r in rows[chunk:chunk + 50])
            existing |= {r["fingerprint"] for r in self.db.select("findings", {"fingerprint": f"in.({fps})"}, "fingerprint")}
        new = [r for r in rows if r["fingerprint"] not in existing]
        for chunk in range(0, len(new), 100):
            self.db.insert("findings", new[chunk:chunk + 100], on_conflict="fingerprint", ignore_duplicates=True)
        self.findings_new += len(new)
        self._bump_hosts(new)
        return len(new)

    def _bump_hosts(self, findings: list[dict]) -> None:
        per_host: dict[str, list[str]] = defaultdict(list)
        for f in findings:
            if f.get("host_id"):
                per_host[f["host_id"]].append(f["severity"])
        by_id = {h["id"]: ip for ip, h in self.hosts.items()}
        for host_id, sevs in per_host.items():
            ip = by_id.get(host_id)
            if not ip:
                continue
            host = self.hosts[ip]
            worst = max(sevs, key=SEVERITY_RANK.get)
            current = host.get("exploitability") or "Info"
            self._upsert_hosts({ip: {
                "vulnerability_count": (host.get("vulnerability_count") or 0) + len(sevs),
                "exploitability": worst if SEVERITY_RANK[worst] > SEVERITY_RANK.get(current, 0) else current,
            }})

    # -- CVE matching (local DB) -------------------------------------------
    def _cve_rows(self, matches: list[tuple[str, str, str | None, str, str | None, str | None]]) -> list[dict]:
        """matches: (product label, version, vendor, nvd product, host_ip, subdomain name)"""
        rows = []
        with cve_db.connect(readonly=True) as conn:
            for label, version, vendor, product, ip, sub in matches:
                for c in cve_db.lookup(conn, product, version, vendor, self.s.cve_max_per_product):
                    where = sub or ip
                    host = self.hosts.get(ip) if ip else None
                    sub_row = self.subs.get(sub) if sub else None
                    rows.append({
                        "target_id": self.target_id,
                        "host_id": host["id"] if host else None,
                        "subdomain_id": sub_row["id"] if sub_row else None,
                        "scan_id": self.scan_id,
                        "title": f"{c['id']}: {label} {version}"[:300],
                        "type": "CVE",
                        "severity": app_severity(c["severity"]),
                        "status": "New",
                        "cvss": c["cvss"],
                        "cwe": c["cwe"],
                        "cve_id": c["id"],
                        "affected_url": sub_row.get("url") if sub_row else None,
                        "evidence": (f"{c['summary']}\n\nVersion match: {label} {version} on {where} "
                                     f"(local NVD mirror). Unconfirmed: verify before reporting.")[:4000],
                        "remediation": f"Upgrade {label} beyond the affected range. https://nvd.nist.gov/vuln/detail/{c['id']}",
                        "found_by": "recon-worker",
                        "source": "cve-local",
                        "tags": ["cve", "auto"],
                        "fingerprint": f"cve:{self.target_id}:{where}:{c['id']}",
                    })
        return rows

    def _cves_from_tech(self, probes: dict[str, dict]) -> int:
        matches = []
        for name, p in probes.items():
            ip = p["ips"][0] if p["ips"] else None
            for product, version in http_probe.tech_versions(p["tech"]):
                vendor, nvd_product, _ = cve_db.resolve_product(product)
                matches.append((product, version, vendor, nvd_product, ip, name if name in self.subs else None))
        return self._save_findings(self._cve_rows(matches))

    def _cves_from_nmap(self, ips: list[str]) -> int:
        matches = []
        for ip in ips:
            for port in (self.hosts.get(ip) or {}).get("ports") or []:
                label = port.get("product") or port.get("service") or ""
                # "8.2p1 Ubuntu 4ubuntu0.5" -> "8.2p1"
                version = (port.get("version") or "").split(" ")[0] or None
                vendor, nvd_product = None, None
                for cpe in port.get("cpe") or []:
                    if not cpe.startswith("cpe:/a:"):
                        continue
                    vendor, nvd_product, cpe_version = cve_db.resolve_product(label, cpe)
                    version = cpe_version or version
                    break
                if not nvd_product and label:
                    vendor, nvd_product, _ = cve_db.resolve_product(label)
                if nvd_product and version:
                    matches.append((f"{label} ({port['port']}/{port['protocol']})", version, vendor, nvd_product, ip, None))
        return self._save_findings(self._cve_rows(matches))

    # -- nuclei --------------------------------------------------------------
    @staticmethod
    def _url_for(name: str, probe: dict) -> str:
        url = probe.get("url") or ""
        host = url.split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0].lower()
        if host == name:
            return url
        return f"{probe.get('scheme') or 'https'}://{name}"

    def _apply_nuclei(self, results: list[dict], probes: dict[str, dict]) -> int:
        rows = []
        for r in results:
            host = r["host"].split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0].lower()
            name = host if host in probes else None
            ip = r.get("ip") or ((probes.get(name) or {}).get("ips") or [None])[0]
            host_row = self.hosts.get(ip) if ip else None
            sub_row = self.subs.get(name) if name else None
            evidence = r["description"]
            if r["extracted"]:
                evidence += "\n\nExtracted: " + ", ".join(map(str, r["extracted"]))
            if r["references"]:
                evidence += "\n\nReferences:\n" + "\n".join(map(str, r["references"]))
            rows.append({
                "target_id": self.target_id,
                "host_id": host_row["id"] if host_row else None,
                "subdomain_id": sub_row["id"] if sub_row else None,
                "scan_id": self.scan_id,
                "title": r["name"],
                "type": "nuclei",
                "severity": app_severity(r["severity"]),
                "status": "New",
                "cvss": r["cvss"] if isinstance(r["cvss"], (int, float)) else None,
                "cwe": r["cwe"],
                "cve_id": r["cve"],
                "affected_url": r["matched_at"],
                "evidence": evidence[:4000] or None,
                "remediation": r["remediation"],
                "found_by": "recon-worker",
                "source": "nuclei",
                "tags": ["nuclei", r["template_id"]][:2],
                "fingerprint": f"nuclei:{self.target_id}:{r['template_id']}:{r['matched_at']}:{r['matcher'] or ''}"[:500],
            })
        return self._save_findings(rows)
