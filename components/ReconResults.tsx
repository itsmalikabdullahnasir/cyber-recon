"use client";

import { useMemo, useState } from "react";
import type { Finding, Host, Subdomain } from "@/lib/types";

const SEV_COLOR: Record<string, string> = {
  Critical: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  High: "border-pink-500/30 bg-pink-500/10 text-pink-300",
  Medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Info: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};
const SEV_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Info: 0 };

// The export shape requested, extended with ports/tech/cves.
interface Row {
  subdomain: string;
  ip: string | null;
  cloudflare: boolean;
  cdn: string | null;
  status: number | null;
  title: string | null;
  tech: string[];
  ports: { port: number; protocol: string; service: string | null; version: string | null }[];
  cves: { id: string; severity: string; cvss: number | null }[];
  findings: { title: string; severity: string; source: string | null; cve: string | null }[];
}

export function ReconResults({
  subdomains,
  hosts,
  findings,
}: {
  subdomains: Subdomain[];
  hosts: Host[];
  findings: Finding[];
}) {
  const [onlyLive, setOnlyLive] = useState(true);
  const [copied, setCopied] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const hostByIp = new Map(hosts.map((h) => [h.ip, h]));
    const findingsByIp = new Map<string, Finding[]>();
    const findingsBySub = new Map<string, Finding[]>();
    for (const f of findings) {
      if (f.subdomain_id) {
        findingsBySub.set(f.subdomain_id, [...(findingsBySub.get(f.subdomain_id) ?? []), f]);
      }
    }
    for (const h of hosts) {
      const list = findings.filter((f) => f.host_id === h.id);
      if (list.length) findingsByIp.set(h.ip, list);
    }

    const built: Row[] = subdomains.map((s) => {
      const ip = s.ip ?? s.resolved_ips?.[0] ?? null;
      const host = ip ? hostByIp.get(ip) : undefined;
      const relevant = [
        ...(findingsBySub.get(s.id) ?? []),
        ...(ip ? findingsByIp.get(ip) ?? [] : []),
      ];
      const seen = new Set<string>();
      const dedup = relevant.filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
      return {
        subdomain: s.name,
        ip,
        cloudflare: !!s.is_cdn && (s.cdn_name?.toLowerCase().includes("cloudflare") ?? !s.cdn_name),
        cdn: s.cdn_name ?? (s.is_cdn ? "CDN" : null),
        status: s.http_status,
        title: s.http_title,
        tech: s.tech ?? [],
        ports: (host?.ports ?? []).map((p) => ({
          port: p.port,
          protocol: p.protocol,
          service: p.service,
          version: p.version,
        })),
        cves: dedup
          .filter((f) => f.cve_id)
          .map((f) => ({ id: f.cve_id as string, severity: f.severity, cvss: f.cvss }))
          .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]),
        findings: dedup.map((f) => ({ title: f.title, severity: f.severity, source: f.source, cve: f.cve_id })),
      };
    });

    // Hosts discovered from a bare-IP scan have no subdomain row.
    const covered = new Set(built.map((r) => r.ip));
    for (const h of hosts) {
      if (h.scan_id && !covered.has(h.ip)) {
        const list = findingsByIp.get(h.ip) ?? [];
        built.push({
          subdomain: h.hostname ?? h.ip,
          ip: h.ip,
          cloudflare: !!h.is_cdn && (h.cdn_name?.toLowerCase().includes("cloudflare") ?? false),
          cdn: h.cdn_name ?? (h.is_cdn ? "CDN" : null),
          status: null,
          title: h.http_title,
          tech: h.tech ?? [],
          ports: (h.ports ?? []).map((p) => ({ port: p.port, protocol: p.protocol, service: p.service, version: p.version })),
          cves: list
            .filter((f) => f.cve_id)
            .map((f) => ({ id: f.cve_id as string, severity: f.severity, cvss: f.cvss })),
          findings: list.map((f) => ({ title: f.title, severity: f.severity, source: f.source, cve: f.cve_id })),
        });
      }
    }

    return built.sort((a, b) => {
      const sev = (r: Row) => Math.max(0, ...r.findings.map((f) => SEV_RANK[f.severity] ?? 0));
      return sev(b) - sev(a) || a.subdomain.localeCompare(b.subdomain);
    });
  }, [subdomains, hosts, findings]);

  const shown = onlyLive ? rows.filter((r) => r.ip || r.ports.length || r.status) : rows;

  function exportJson() {
    // Matches the requested shape: [{subdomain, ip, cloudflare, ports, tech, cves}]
    const data = shown.map((r) => ({
      subdomain: r.subdomain,
      ip: r.ip,
      cloudflare: r.cloudflare,
      cdn: r.cdn,
      status: r.status,
      ports: r.ports.map((p) => p.port),
      port_detail: r.ports,
      tech: r.tech,
      cves: r.cves.map((c) => c.id),
      cve_detail: r.cves,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recon-results.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyJson() {
    const data = shown.map((r) => ({
      subdomain: r.subdomain,
      ip: r.ip,
      cloudflare: r.cloudflare,
      ports: r.ports.map((p) => p.port),
      tech: r.tech,
      cves: r.cves.map((c) => c.id),
    }));
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-white/5 bg-surface p-6 text-center text-sm text-muted-dim">
        No recon results yet. Run a scan to populate this view.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-dim">
          <input type="checkbox" checked={onlyLive} onChange={(e) => setOnlyLive(e.target.checked)} />
          Resolving / live only
        </label>
        <span className="text-[11px] text-muted-dim">{shown.length} rows</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={copyJson}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-foreground"
          >
            {copied ? "Copied!" : "Copy JSON"}
          </button>
          <button
            onClick={exportJson}
            className="rounded-lg border border-accent/30 bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/25"
          >
            Export JSON
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[800px] text-left text-xs">
          <thead className="border-b border-white/5 bg-white/[0.02] text-[10px] uppercase tracking-wide text-muted-dim">
            <tr>
              <th className="px-3 py-2">Subdomain</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">CDN</th>
              <th className="px-3 py-2">Ports</th>
              <th className="px-3 py-2">Tech</th>
              <th className="px-3 py-2">CVEs / findings</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.subdomain + (r.ip ?? "")} className="border-b border-white/[0.03] align-top hover:bg-white/[0.02]">
                <td className="px-3 py-2 font-mono">
                  {r.subdomain}
                  {r.title && <div className="mt-0.5 text-[10px] text-muted-dim">{r.title}</div>}
                </td>
                <td className="px-3 py-2 font-mono text-muted">{r.ip ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.cloudflare ? (
                    <span className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-orange-300">
                      Cloudflare
                    </span>
                  ) : r.cdn ? (
                    <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300">
                      {r.cdn}
                    </span>
                  ) : (
                    <span className="text-muted-dim">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.ports.length === 0 ? (
                    <span className="text-muted-dim">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {r.ports.map((p) => (
                        <span
                          key={p.port}
                          title={[p.service, p.version].filter(Boolean).join(" ")}
                          className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px]"
                        >
                          {p.port}
                          {p.service && <span className="text-muted-dim">/{p.service}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.tech.length === 0 ? (
                    <span className="text-muted-dim">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {r.tech.map((t) => (
                        <span key={t} className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.findings.length === 0 ? (
                    <span className="text-muted-dim">—</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {r.findings.slice(0, 8).map((f, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                          <span className={`rounded border px-1 py-0.5 text-[9px] font-semibold ${SEV_COLOR[f.severity]}`}>
                            {f.severity}
                          </span>
                          <span className="text-[10px]">{f.cve ?? f.title}</span>
                        </span>
                      ))}
                      {r.findings.length > 8 && (
                        <span className="text-[10px] text-muted-dim">+{r.findings.length - 8} more</span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
