"""The scan pipeline. Runs in the single worker thread, one scan at a time.

passive: subfinder -> dnsx -> httpx (+CDN) -> whatweb/wafw00f -> CVE match on tech
full:    passive + [scope gate] nmap -> CVE on nmap versions -> nuclei
                 -> feroxbuster (dirs) -> nikto
"""

import hashlib
import logging
import re
import threading
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from . import cve_db
from .config import get_settings
from .modules.registry import MODULES
from .proc import ToolError
from .runners import (
    dnsx,
    feroxbuster,
    http_probe,
    nikto,
    nmap,
    nuclei,
    origin,
    screenshot,
    subfinder,
    testssl,
    wafw00f,
    whatweb,
)
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


class ScanCancelled(Exception):
    pass


class Pipeline:
    def __init__(self, db: Supabase, scan: dict) -> None:
        self.db = db
        self.scan = scan
        self.scan_id: str = scan["id"]
        self.target_id: str = scan["target_id"]
        self.mode: str = scan["mode"]
        configured_pipeline = scan.get("pipeline")
        self.pipeline_ids: set[str] | None = (
            {item["id"] for item in configured_pipeline if isinstance(item, dict) and item.get("enabled") and isinstance(item.get("id"), str)}
            if isinstance(configured_pipeline, list)
            else None
        )
        self.email: str | None = scan.get("requested_by_email")
        self.stages: dict = dict(scan.get("stages") or {})
        self.total_stages = len(self.pipeline_ids) if self.pipeline_ids is not None else len(MODULES)
        self.s = get_settings()
        self.workdir: Path = self.s.results_dir / self.scan_id
        # name -> subdomain row, ip -> host row (kept in sync with the DB)
        self.subs: dict[str, dict] = {}
        self.hosts: dict[str, dict] = {}
        self.findings_new = 0
        self.findings_updated = 0

    def _enabled(self, module_id: str) -> bool:
        """Return whether a selected pipeline includes a module."""
        return self.pipeline_ids is None or module_id in self.pipeline_ids

    # -- bookkeeping ---------------------------------------------------------
    def stage(self, name: str, status: str, **info) -> None:
        # Starting a new stage is the checkpoint where we honor a user "stop":
        # if the row is no longer 'running', the user cancelled it — abort here.
        if status == "running":
            self._abort_if_cancelled()
        self.stages[name] = {"status": status, "at": now_iso(), **info}
        log.info("scan %s stage %s %s %s", self.scan_id, name, status, info)
        completed = sum(
            1 for stage in self.stages.values()
            if stage.get("status") in ("done", "skipped", "refused")
        )
        self.db.update(
            "scans",
            {"id": f"eq.{self.scan_id}"},
            {
                "stage": name,
                "stages": self.stages,
                "last_stage_at": self.stages[name]["at"],
                "total_stages": self.total_stages,
                "completed_stages": completed,
                "worker_heartbeat_at": self.stages[name]["at"],
            },
        )
        try:
            self.db.insert("scan_logs", {
                "scan_id": self.scan_id,
                "level": "error" if status == "failed" else "info",
                "stage": name,
                "message": f"Stage {name} {status}",
                "metadata": info,
            })
        except Exception:
            log.exception("scan log write failed for %s", self.scan_id)

    def _abort_if_cancelled(self) -> None:
        try:
            rows = self.db.select("scans", {"id": f"eq.{self.scan_id}"}, "status")
        except Exception:
            return  # don't let a transient read error abort a good scan
        if rows and rows[0].get("status") not in ("running", None):
            raise ScanCancelled()

    # -- entry point ---------------------------------------------------------
    def run(self) -> None:
        self.workdir.mkdir(parents=True, exist_ok=True)
        started = now_iso()
        self.db.update(
            "scans",
            {"id": f"eq.{self.scan_id}"},
            {
                "status": "running",
                "started_at": started,
                "last_stage_at": started,
                "total_stages": self.total_stages,
                "completed_stages": 0,
                "worker_heartbeat_at": started,
            },
        )
        self.db.notify(self.email, f"🛰️ Scan started — {self.scan['input']}",
                       f"{self.mode} scan running on the recon VM", self.target_id)
        stop_heartbeat = threading.Event()

        def _heartbeat_ticker():
            while not stop_heartbeat.wait(15):
                try:
                    self.db.update("scans", {"id": f"eq.{self.scan_id}"}, {"worker_heartbeat_at": now_iso()})
                except Exception:
                    pass

        hb_thread = threading.Thread(target=_heartbeat_ticker, daemon=True, name=f"heartbeat-{self.scan_id}")
        hb_thread.start()

        try:
            try:
                self._run()
            finally:
                stop_heartbeat.set()
        except ScanCancelled:
            log.info("scan %s cancelled by user", self.scan_id)
            self.db.update("scans", {"id": f"eq.{self.scan_id}"},
                           {"status": "failed", "error": "cancelled by user", "finished_at": now_iso(), "stages": self.stages,
                            "completed_stages": self._completed_stage_count()})
            self.db.notify(self.email, f"⏹️ Scan stopped — {self.scan['input']}", "cancelled by user", self.target_id)
            return
        except Exception as e:
            log.exception("scan %s failed", self.scan_id)
            self.db.update("scans", {"id": f"eq.{self.scan_id}"},
                           {"status": "failed", "error": str(e)[:1000], "finished_at": now_iso(), "stages": self.stages,
                            "completed_stages": self._completed_stage_count(), "worker_heartbeat_at": now_iso(),
                            "duration_seconds": max(0, int((datetime.fromisoformat(now_iso()) - datetime.fromisoformat(started)).total_seconds()))})
            self.db.notify(self.email, f"❌ Scan failed — {self.scan['input']}", str(e)[:300], self.target_id)
            self.db.activity(self.target_id, "Recon scan failed", f"{self.scan['input']}: {str(e)[:300]}")
            return

        try:
            self._score_hosts()
        except Exception:
            log.exception("risk scoring failed for scan %s", self.scan_id)

        live = sum(1 for h in self.hosts.values() if h.get("status") == "Live")
        summary = (f"{self.scan['input']}: {len(self.subs)} subdomains, {live} live hosts, "
                   f"{self.findings_new} new findings")
        finished = now_iso()
        self.db.update("scans", {"id": f"eq.{self.scan_id}"},
                       {"status": "done", "stage": "done", "finished_at": now_iso(), "stages": self.stages,
                        "last_stage_at": finished, "worker_heartbeat_at": finished, "total_stages": self.total_stages,
                        "completed_stages": self.total_stages,
                        "duration_seconds": max(0, int((datetime.fromisoformat(finished) - datetime.fromisoformat(started)).total_seconds())),
                        "hosts_discovered": len(self.hosts), "findings_created": self.findings_new,
                        "findings_updated": self.findings_updated})
        self.db.notify(self.email, f"✅ Scan complete — {self.scan['input']}", summary, self.target_id)
        self.db.activity(self.target_id, f"Recon scan ({self.mode}) finished", summary)

    def _completed_stage_count(self) -> int:
        return sum(
            1 for stage in self.stages.values()
            if stage.get("status") in ("done", "skipped", "refused")
        )

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
        if kind == "domain" and self._enabled("subfinder"):
            if self.mode == "enrich":
                # Known host: skip subfinder, just confirm + probe this name.
                self.stage("subfinder", "skipped", detail="enrich mode")
                found = [{"name": value, "sources": ["input"]}]
            else:
                self.stage("subfinder", "running")
                found = subfinder.run(value, self.workdir)
                self.stage("subfinder", "done", count=len(found))
            self._upsert_subdomains(found)

            if self._enabled("dnsx"):
                self.stage("dnsx", "running")
                resolved = dnsx.run([f["name"] for f in found], self.workdir)
                # SSRF guard: never probe a name that resolves to a private /
                # internal address (e.g. a domain pointed at 127.0.0.1 or a
                # cloud metadata IP). Strip private IPs; drop names left with none.
                resolved = {
                    name: {**r, "ips": [ip for ip in r["ips"] if normalize_public_ip(ip)]}
                    for name, r in resolved.items()
                }
                resolved = {name: r for name, r in resolved.items() if r["ips"]}
                self._apply_dns(resolved)
                self.stage("dnsx", "done", count=len(resolved), unresolved=len(found) - len(resolved))
            else:
                resolved = {f["name"]: [] for f in found}
                self.stage("dnsx", "skipped", detail="disabled by selected pipeline")
            probe_inputs = sorted(resolved)
        else:
            self.stage("subfinder", "skipped", detail="input is an IP or disabled")
            self.stage("dnsx", "skipped", detail="input is an IP")
            resolved = {}
            probe_inputs = [value]

        # c + d: httpx + CDN flag -> hosts
        if self._enabled("httpx"):
            self.stage("httpx", "running")
            probes, warning = http_probe.run(probe_inputs, self.workdir)
            self._apply_probes(probes, resolved)
        else:
            probes, warning = {}, None
            self.stage("httpx", "skipped", detail="disabled by selected pipeline")
        if kind == "ip" and value not in probes:
            # No HTTP answer. Still record it; nmap decides whether anything is open.
            self._upsert_hosts({value: {"status": "Filtered"}})
        cdn = sum(1 for p in probes.values() if p["is_cdn"])
        self.stage("httpx", "done", live=len(probes), cdn=cdn, **({"warning": warning} if warning else {}))

        # Visual evidence is collected only after HTTP probing has established a
        # public, responsive URL. It is opt-in because a browser loads assets.
        self._capture_screenshots(probes)

        # e0: origin discovery — if the site is CDN-fronted, look for the real
        # server leaking through non-proxied records (mail, ftp, dev, …).
        # Skipped in enrich mode to keep bulk runs fast.
        if kind == "domain" and self.mode != "enrich":
            if cdn > 0:
                self.stage("origin", "running")
                self._discover_origin(value, probes)
            else:
                self.stage("origin", "skipped", detail="not behind a CDN")

        # c2 + c3: whatweb (deeper tech) + wafw00f (WAF). Passive tier: light,
        # runs on any input. whatweb output is merged into probe tech so the
        # CVE match below sees it.
        if self._enabled("fingerprint") or self._enabled("whatweb") or self._enabled("wafw00f"):
            self._fingerprint(probes)
        else:
            self.stage("whatweb", "skipped", detail="disabled by selected pipeline")
            self.stage("wafw00f", "skipped", detail="disabled by selected pipeline")

        # f (passive part): CVEs from httpx + whatweb tech versions
        cve_ready = cve_db.is_ready()
        if cve_ready and self._enabled("cve"):
            self.stage("cve", "running", source="httpx")
            n = self._cves_from_tech(probes)
            self.stage("cve", "done" if self.mode == "passive" else "running", count=n, source="httpx")
        else:
            self.stage("cve", "skipped", detail="disabled by selected pipeline or local CVE DB not synced")

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
        nmap_enabled = self._enabled("nmap")
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

        if not nmap_enabled:
            self.stage("nmap", "skipped", detail="disabled by selected pipeline")
        else:
            self.stage("nmap", "running", queued=len(allowed), skipped_cdn=len(skipped_cdn),
                       skipped_out_of_scope=len(skipped_scope), skipped_cap=len(capped))
        errors = []
        for i, ip in enumerate(allowed if nmap_enabled else [], 1):
            try:
                result = nmap.run(ip, self.workdir)
            except ToolError as e:
                errors.append(f"{ip}: {e}")
                continue
            except Exception as e:
                log.warning("nmap run on %s encountered unexpected error: %s", ip, e)
                errors.append(f"{ip}: {e}")
                continue
            self._apply_nmap(ip, result)
            self.stage("nmap", "running", done=i, queued=len(allowed), skipped_cdn=len(skipped_cdn),
                       skipped_out_of_scope=len(skipped_scope), skipped_cap=len(capped))
        if nmap_enabled:
            self.stage("nmap", "done", scanned=len(allowed) - len(errors), skipped_cdn=len(skipped_cdn),
                       skipped_out_of_scope=len(skipped_scope), skipped_cap=len(capped),
                       **({"errors": errors[:10]} if errors else {}))

        # f (active part): CVEs from nmap versions
        if cve_ready:
            n = self._cves_from_nmap(allowed)
            self.stage("cve", "done", count=self.stages.get("cve", {}).get("count", 0) + n, source="httpx+nmap")

        # In-scope live URLs (host-gated), reused by nuclei + the web tools below.
        # CDN/Cloudflare hosts are skipped: you'd be scanning the edge, not the
        # origin — it's pointless and nuclei against a WAF is very slow.
        candidates = [
            (name, p) for name, p in sorted(probes.items())
            if scope.hostname_allowed(name) or any(scope.ip_allowed(ip) for ip in p["ips"])
        ]
        cdn_skipped = sum(1 for _, p in candidates if p["is_cdn"])
        inscope: list[tuple[str, dict]] = [(n, p) for n, p in candidates if not p["is_cdn"]][: self.s.max_heavy_hosts]
        urls = [self._url_for(name, p) for name, p in inscope]

        # g: testssl (optional TLS audit), then nuclei
        if self.pipeline_ids is not None and self._enabled("testssl"):
            self._run_testssl(inscope)
        else:
            self.stage("testssl", "skipped", detail="disabled by selected pipeline")

        if not self._enabled("nuclei"):
            self.stage("nuclei", "skipped", detail="disabled by selected pipeline")
        elif not urls:
            self.stage("nuclei", "skipped", detail=f"no non-CDN in-scope hosts ({cdn_skipped} CDN skipped)")
        else:
            self.stage("nuclei", "running", urls=len(urls), cdn_skipped=cdn_skipped)
            try:
                results = nuclei.run(urls, self.workdir)
                n = self._apply_nuclei(results, probes)
                self.stage("nuclei", "done", urls=len(urls), findings=n, cdn_skipped=cdn_skipped)
            except ToolError as e:
                self.stage("nuclei", "skipped", detail=str(e))

        # h: feroxbuster (content/directory discovery)
        if self._enabled("dirs") and self.s.enable_feroxbuster:
            self._run_feroxbuster(inscope)
        else:
            self.stage("dirs", "skipped", detail="disabled by selected pipeline or VM setting")

        # i: nikto (web-server misconfig). Off by default (noisy/slow).
        if self._enabled("nikto") and self.s.enable_nikto:
            self._run_nikto(inscope)
        else:
            self.stage("nikto", "skipped", detail="disabled (set ENABLE_NIKTO=true)")

    # -- origin discovery + risk scoring -------------------------------------
    def _discover_origin(self, domain: str, probes: dict[str, dict]) -> None:
        try:
            candidates = origin.run(domain, self.workdir)
        except Exception as e:
            self.stage("origin", "done", found=0, error=str(e)[:150])
            return
        if not candidates:
            self.stage("origin", "done", found=0)
            return
        rows = [{
            "target_id": self.target_id, "host_id": None, "subdomain_id": None, "scan_id": self.scan_id,
            "title": f"Possible origin IP {ip} (via {via})"[:300], "type": "origin-candidate",
            "severity": "Low", "status": "New", "affected_url": via,
            "evidence": (f"{via} resolves to {ip}, which is public and not in a CDN range — a likely origin "
                         f"behind the CDN. Verify: it may be a third-party mail/hosting provider."),
            "remediation": "If this is the origin, firewall it to accept traffic only from the CDN.",
            "found_by": "recon-worker", "source": "origin", "tags": ["origin", "cdn-bypass"],
            "fingerprint": f"origin:{self.target_id}:{ip}",
        } for ip, via in candidates.items()]
        n = self._save_findings(rows)
        for p in probes.values():
            if p["is_cdn"]:
                ip0 = self._host_ip_for(p)
                if ip0:
                    self._upsert_hosts({ip0: {"origin_ips": sorted(candidates)}})
        self.stage("origin", "done", found=len(candidates), new_findings=n, ips=list(candidates)[:10])

    def _score_hosts(self) -> None:
        """Set a 0-100 risk score on each host this scan touched."""
        host_ids = {h["id"]: ip for ip, h in self.hosts.items() if h.get("scan_id") == self.scan_id}
        if not host_ids:
            return
        tally: dict[str, dict[str, int]] = {hid: {"Critical": 0, "High": 0, "Medium": 0, "Low": 0} for hid in host_ids}
        cve_hosts: set[str] = set()
        try:
            findings = self.db.select("findings", {"target_id": f"eq.{self.target_id}"}, "host_id,severity,cve_id")
        except Exception:
            findings = []
        for f in findings:
            hid = f.get("host_id")
            if hid in tally:
                sev = f.get("severity") or "Info"
                if sev in tally[hid]:
                    tally[hid][sev] += 1
                if f.get("cve_id"):
                    cve_hosts.add(hid)
        for hid, ip in host_ids.items():
            c = tally[hid]
            score = c["Critical"] * 30 + c["High"] * 18 + c["Medium"] * 8 + c["Low"] * 3
            score += min(len(self.hosts[ip].get("ports") or []) * 3, 18)
            if hid in cve_hosts:
                score += 8
            if self.hosts[ip].get("is_cdn"):
                score = max(0, score - 5)  # edge, less actionable
            self._upsert_hosts({ip: {"risk_score": min(100, score)}})

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

    def _capture_screenshots(self, probes: dict[str, dict]) -> None:
        if not getattr(self.s, "enable_screenshots", False):
            self.stage("screenshots", "skipped", detail="disabled (set ENABLE_SCREENSHOTS=true)")
            return
        maximum = getattr(self.s, "screenshot_max_hosts", 20)
        self.stage("screenshots", "running", hosts=min(len(probes), maximum))
        saved = errors = 0
        for name, probe in list(sorted(probes.items()))[:maximum]:
            url = probe.get("url")
            if not isinstance(url, str) or not url.startswith(("http://", "https://")):
                continue
            try:
                image = screenshot.run(url, self.workdir, self._safe(name), probe.get("title"))
                if not image:
                    continue
                sub = self.subs.get(name)
                self.db.insert("web_screenshots", {
                    "target_id": self.target_id, "subdomain_id": sub["id"] if sub else None,
                    "scan_id": self.scan_id, "hostname": name, "url": url,
                    "page_type": image["page_type"], "image_path": str(image["path"]),
                    "byte_size": image["bytes"],
                })
                saved += 1
            except Exception as e:
                log.warning("screenshot %s: %s", name, e)
                errors += 1
        self.stage("screenshots", "done", captured=saved, failed=errors)

    # -- extra tool stages ---------------------------------------------------
    @staticmethod
    def _safe(name: str) -> str:
        return re.sub(r"[^a-z0-9.\-]", "_", name.lower())[:60] or "host"

    def _host_ip_for(self, probe: dict) -> str | None:
        for ip in probe.get("ips") or []:
            if ip in self.hosts:
                return ip
        return None

    def _fingerprint(self, probes: dict[str, dict]) -> None:
        """whatweb (merge tech) + wafw00f (WAF). Passive tier, light-touch."""
        tools = [t for t, on in (("whatweb", self.s.enable_whatweb), ("wafw00f", self.s.enable_wafw00f)) if on]
        if not probes or not tools:
            self.stage("fingerprint", "skipped", detail="no live hosts" if not probes else "disabled")
            return
        self.stage("fingerprint", "running", tools=tools)
        items = sorted(probes.items())[: self.s.max_heavy_hosts]
        tech_added = waf_found = 0
        for name, p in items:
            url = self._url_for(name, p)
            if self.s.enable_whatweb:
                try:
                    pairs = whatweb.run(url, self.workdir, self._safe(name))
                except Exception as e:
                    log.warning("whatweb %s: %s", name, e)
                    pairs = []
                added = False
                for prod, ver in pairs:
                    tok = f"{prod}:{ver}" if ver else prod
                    if tok not in p["tech"]:
                        p["tech"].append(tok)
                        added = True
                        tech_added += 1
                if added:
                    merged = sorted(set(p["tech"]))
                    if name in self.subs:
                        self._write_subs({name: {"tech": merged, "services": ", ".join(merged)[:500] or None}})
                    ip = self._host_ip_for(p)
                    if ip:
                        self._upsert_hosts({ip: {"tech": sorted(set((self.hosts[ip].get("tech") or []) + merged))}})
            if self.s.enable_wafw00f:
                try:
                    waf = wafw00f.run(url, self.workdir, self._safe(name))
                except Exception as e:
                    log.warning("wafw00f %s: %s", name, e)
                    waf = None
                if waf:
                    waf_found += 1
                    ip = self._host_ip_for(p)
                    if ip:
                        self._upsert_hosts({ip: {"waf": waf}})
        self.stage("fingerprint", "done", hosts=len(items), tech_added=tech_added, waf=waf_found)

    def _run_testssl(self, inscope: list[tuple[str, dict]]) -> None:
        if not inscope:
            self.stage("testssl", "skipped", detail="no in-scope live hosts")
            return
        self.stage("testssl", "running", hosts=len(inscope))
        rows, total = [], 0
        for i, (name, p) in enumerate(inscope, 1):
            try:
                findings = testssl.run(name, self.workdir, self._safe(name))
            except Exception as e:
                log.warning("testssl %s: %s", name, e)
                continue
            ip = self._host_ip_for(p)
            if findings and ip:
                self._upsert_hosts({ip: {"tls_findings": findings[:50]}})
            host_id = self.hosts[ip]["id"] if ip else None
            sub = self.subs.get(name)
            for f in findings:
                total += 1
                rows.append({
                    "target_id": self.target_id, "host_id": host_id,
                    "subdomain_id": sub["id"] if sub else None, "scan_id": self.scan_id,
                    "title": f"TLS: {f['finding']}"[:300], "type": "tls",
                    "severity": app_severity(f["severity"]), "status": "New",
                    "cve_id": f["cve"], "affected_url": p.get("url") or f"https://{name}",
                    "evidence": f"testssl.sh {f['id']}: {f['finding']}"[:4000],
                    "found_by": "recon-worker", "source": "testssl", "tags": ["tls", "testssl"],
                    "fingerprint": f"testssl:{self.target_id}:{name}:{f['id']}",
                })
            self.stage("testssl", "running", done=i, hosts=len(inscope), findings=total)
        n = self._save_findings(rows)
        self.stage("testssl", "done", hosts=len(inscope), findings=n)

    def _run_feroxbuster(self, inscope: list[tuple[str, dict]]) -> None:
        if not inscope:
            self.stage("dirs", "skipped", detail="no in-scope live hosts")
            return
        self.stage("dirs", "running", hosts=len(inscope))
        rows, total = [], 0
        for i, (name, p) in enumerate(inscope, 1):
            url = self._url_for(name, p)
            try:
                dirs = feroxbuster.run(url, self.workdir, self._safe(name))
            except ToolError as e:
                self.stage("dirs", "running", done=i, hosts=len(inscope), found=total, error=str(e)[:200])
                continue
            except Exception as e:
                log.warning("feroxbuster %s: %s", name, e)
                continue
            ip = self._host_ip_for(p)
            if dirs and ip:
                self._upsert_hosts({ip: {"dirs": dirs}})
            host_id = self.hosts[ip]["id"] if ip else None
            sub = self.subs.get(name)
            for d in dirs:
                total += 1
                sev = "Low" if d["status"] in (200, 401, 403, 500) else "Info"
                rows.append({
                    "target_id": self.target_id, "host_id": host_id,
                    "subdomain_id": sub["id"] if sub else None, "scan_id": self.scan_id,
                    "title": f"Exposed path [{d['status']}] {d['path']}"[:300], "type": "exposed-path",
                    "severity": sev, "status": "New", "affected_url": d["url"],
                    "evidence": f"feroxbuster: {d['url']} -> HTTP {d['status']} ({d['length']} bytes)"[:4000],
                    "found_by": "recon-worker", "source": "feroxbuster", "tags": ["content", "feroxbuster"],
                    "fingerprint": f"ferox:{self.target_id}:{name}:{d['status']}:{d['path']}",
                })
            self.stage("dirs", "running", done=i, hosts=len(inscope), found=total)
        n = self._save_findings(rows)
        self.stage("dirs", "done", hosts=len(inscope), found=n)

    def _run_nikto(self, inscope: list[tuple[str, dict]]) -> None:
        if not inscope:
            self.stage("nikto", "skipped", detail="no in-scope live hosts")
            return
        self.stage("nikto", "running", hosts=len(inscope))
        rows, total = [], 0
        for i, (name, p) in enumerate(inscope, 1):
            url = self._url_for(name, p)
            try:
                items = nikto.run(url, self.workdir, self._safe(name))
            except Exception as e:
                log.warning("nikto %s: %s", name, e)
                continue
            host_id = self.hosts[ip]["id"] if (ip := self._host_ip_for(p)) else None
            sub = self.subs.get(name)
            for v in items:
                total += 1
                rows.append({
                    "target_id": self.target_id, "host_id": host_id,
                    "subdomain_id": sub["id"] if sub else None, "scan_id": self.scan_id,
                    "title": f"nikto: {v['msg']}"[:300], "type": "nikto",
                    "severity": "Low", "status": "New", "affected_url": v["url"] or url,
                    "evidence": f"nikto {v['id']} [{v['method']}] {v['url']}: {v['msg']}"[:4000],
                    "found_by": "recon-worker", "source": "nikto", "tags": ["nikto"],
                    "fingerprint": f"nikto:{self.target_id}:{name}:{v['id']}:{v['url']}",
                })
            self.stage("nikto", "running", done=i, hosts=len(inscope), findings=total)
        n = self._save_findings(rows)
        self.stage("nikto", "done", hosts=len(inscope), findings=n)

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
        """Upsert stable findings while preserving user-managed lifecycle fields."""
        if not rows:
            return 0
        for r in rows:
            r["fingerprint"] = hashlib.sha256(
                "\0".join([
                    str(r.get("target_id") or ""),
                    str(r.get("host_id") or ""),
                    str(r.get("affected_url") or ""),
                    str(r.get("cve_id") or ""),
                    str(r.get("title") or ""),
                ]).encode()
            ).hexdigest()
        rows = list({r["fingerprint"]: r for r in rows}.values())
        existing = set()
        for chunk in range(0, len(rows), 50):
            fps = ",".join(r["fingerprint"] for r in rows[chunk:chunk + 50])
            existing |= {
                (r["fingerprint"], r["id"], r.get("occurrence_count") or 1)
                for r in self.db.select("findings", {"fingerprint": f"in.({fps})"}, "id,fingerprint,occurrence_count")
            }
        existing_by_fingerprint = {fingerprint: (row_id, count) for fingerprint, row_id, count in existing}
        new = [r for r in rows if r["fingerprint"] not in existing_by_fingerprint]
        self.findings_updated += len(rows) - len(new)
        seen_at = now_iso()
        for r in rows:
            match = existing_by_fingerprint.get(r["fingerprint"])
            if not match:
                r["first_seen_at"] = seen_at
                r["last_seen_at"] = seen_at
                r["occurrence_count"] = 1
                continue
            row_id, count = match
            self.db.update("findings", {"id": f"eq.{row_id}"}, {
                "last_seen_at": seen_at,
                "occurrence_count": count + 1,
                "evidence": r.get("evidence"),
                "remediation": r.get("remediation"),
                "cvss": r.get("cvss"),
                "cwe": r.get("cwe"),
                "source": r.get("source"),
                "scan_id": r.get("scan_id"),
            })
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
