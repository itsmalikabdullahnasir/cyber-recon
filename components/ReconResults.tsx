"use client";

import { Fragment, useMemo, useState } from "react";
import type { Finding, Host, Subdomain, Target } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type GroupLite = Pick<Target, "id" | "name">;

const SEV_COLOR: Record<string, string> = {
  Critical: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  High: "border-pink-500/30 bg-pink-500/10 text-pink-300",
  Medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Info: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};
const SEV_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Info: 0 };

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-background/40 p-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-dim">{label}</p>
      <p className="mt-1 break-words text-xs text-foreground">{value}</p>
    </div>
  );
}

function DetailList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-lg border border-white/5 bg-background/40 p-3">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-dim">{label}</p>
      {values.length === 0 ? (
        <p className="mt-2 text-xs text-muted-dim">—</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((value, index) => (
            <span key={`${value}-${index}`} className="rounded bg-white/5 px-2 py-1 text-[10px] text-foreground">
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// The export shape requested, extended with ports/tech/cves.
interface Row {
  subId: string | null;
  hostId: string | null;
  risk: number | null;
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
  host: Host | null;
}

export function ReconResults({
  subdomains,
  hosts,
  findings,
  assignTargets,
  onAssigned,
}: {
  subdomains: Subdomain[];
  hosts: Host[];
  findings: Finding[];
  assignTargets?: GroupLite[];
  onAssigned?: () => void;
}) {
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const rowKey = (r: Row) => `${r.subId ?? ""}|${r.hostId ?? ""}|${r.subdomain}`;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function assign(row: Row, targetId: string) {
    if (!targetId) return;
    setAssigning(row.subId ?? row.hostId ?? "");
    const supabase = createClient();
    if (row.subId) {
      await supabase.from("subdomains").update({ target_id: targetId }).eq("id", row.subId);
      await supabase.from("findings").update({ target_id: targetId }).eq("subdomain_id", row.subId);
    }
    if (row.hostId) {
      await supabase.from("hosts").update({ target_id: targetId }).eq("id", row.hostId);
      await supabase.from("findings").update({ target_id: targetId }).eq("host_id", row.hostId);
    }
    setAssigning(null);
    onAssigned?.();
  }

  async function bulkAssign(targetId: string, selectedRows: Row[]) {
    if (!targetId || selectedRows.length === 0) return;
    setBulkBusy(true);
    const supabase = createClient();
    const subIds = selectedRows.map((r) => r.subId).filter((x): x is string => !!x);
    const hostIds = selectedRows.map((r) => r.hostId).filter((x): x is string => !!x);
    const chunk = async (ids: string[], fn: (c: string[]) => PromiseLike<unknown>) => {
      for (let i = 0; i < ids.length; i += 100) await fn(ids.slice(i, i + 100));
    };
    if (subIds.length) {
      await chunk(subIds, (c) => supabase.from("subdomains").update({ target_id: targetId }).in("id", c));
      await chunk(subIds, (c) => supabase.from("findings").update({ target_id: targetId }).in("subdomain_id", c));
    }
    if (hostIds.length) {
      await chunk(hostIds, (c) => supabase.from("hosts").update({ target_id: targetId }).in("id", c));
      await chunk(hostIds, (c) => supabase.from("findings").update({ target_id: targetId }).in("host_id", c));
    }
    setBulkBusy(false);
    setSelected(new Set());
    onAssigned?.();
  }

  async function deleteRows(selectedRows: Row[]) {
    if (selectedRows.length === 0) return;
    if (!confirm(`Delete ${selectedRows.length} result(s)? This removes the subdomain, its host and their findings.`)) return;
    setBulkBusy(true);
    const supabase = createClient();
    const subIds = selectedRows.map((r) => r.subId).filter((x): x is string => !!x);
    const hostIds = selectedRows.map((r) => r.hostId).filter((x): x is string => !!x);
    const chunk = async (ids: string[], fn: (c: string[]) => PromiseLike<unknown>) => {
      for (let i = 0; i < ids.length; i += 100) await fn(ids.slice(i, i + 100));
    };
    // Findings first (so nothing is orphaned), then the hosts/subdomains.
    if (subIds.length) await chunk(subIds, (c) => supabase.from("findings").delete().in("subdomain_id", c));
    if (hostIds.length) await chunk(hostIds, (c) => supabase.from("findings").delete().in("host_id", c));
    if (subIds.length) await chunk(subIds, (c) => supabase.from("subdomains").delete().in("id", c));
    if (hostIds.length) await chunk(hostIds, (c) => supabase.from("hosts").delete().in("id", c));
    setBulkBusy(false);
    setSelected(new Set());
    onAssigned?.();
  }

  const [onlyLive, setOnlyLive] = useState(true);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState<"All" | "Critical" | "High" | "Medium" | "Low">("All");
  const [limit, setLimit] = useState(50);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

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
        subId: s.id,
        hostId: host?.id ?? null,
        risk: host?.risk_score ?? null,
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
        host: host ?? null,
      };
    });

    // Hosts discovered from a bare-IP scan have no subdomain row.
    const covered = new Set(built.map((r) => r.ip));
    for (const h of hosts) {
      if (h.scan_id && !covered.has(h.ip)) {
        const list = findingsByIp.get(h.ip) ?? [];
        built.push({
          subId: null,
          hostId: h.id,
          risk: h.risk_score ?? null,
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
          host: h,
        });
      }
    }

    return built.sort((a, b) => {
      const sev = (r: Row) => Math.max(0, ...r.findings.map((f) => SEV_RANK[f.severity] ?? 0));
      return (b.risk ?? -1) - (a.risk ?? -1) || sev(b) - sev(a) || a.subdomain.localeCompare(b.subdomain);
    });
  }, [subdomains, hosts, findings]);

  const filtered = useMemo(() => {
    let r = onlyLive ? rows.filter((x) => x.ip || x.ports.length || x.status) : rows;
    if (risk !== "All") {
      const min = SEV_RANK[risk];
      r = r.filter((x) => x.findings.some((f) => (SEV_RANK[f.severity] ?? 0) >= min));
    }
    const q = query.trim().toLowerCase();
    if (q) r = r.filter((x) => x.subdomain.toLowerCase().includes(q) || (x.ip ?? "").includes(q));
    return r;
  }, [rows, onlyLive, risk, query]);

  const shown = filtered.slice(0, limit);
  const hasAssign = !!(assignTargets && assignTargets.length > 0);

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
        <div className="relative">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setLimit(50); }}
            placeholder="Search IP or subdomain…"
            className="w-52 rounded-lg border border-white/10 bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:border-accent/40"
          />
          <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.3-4.3m0 0A7.5 7.5 0 105.2 5.2a7.5 7.5 0 0011.5 11.5z" />
          </svg>
        </div>
        <select
          value={risk}
          onChange={(e) => { setRisk(e.target.value as typeof risk); setLimit(50); }}
          className="rounded-lg border border-white/10 bg-background px-2 py-1.5 text-xs outline-none focus:border-accent/40"
        >
          <option value="All">All risk</option>
          <option value="Critical">Critical+</option>
          <option value="High">High+</option>
          <option value="Medium">Medium+</option>
          <option value="Low">Low+</option>
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-dim">
          <input type="checkbox" checked={onlyLive} onChange={(e) => setOnlyLive(e.target.checked)} />
          Live only
        </label>
        <span className="text-[11px] text-muted-dim">
          {shown.length} of {filtered.length}
        </span>
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

      {hasAssign && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs">
          <span className="font-medium text-accent">{selected.size} selected</span>
          <select
            defaultValue=""
            disabled={bulkBusy}
            onChange={(e) => {
              const rows = shown.filter((r) => selected.has(rowKey(r)));
              bulkAssign(e.target.value, rows);
              e.target.value = "";
            }}
            className="rounded-md border border-white/10 bg-background px-2 py-1 text-[11px] outline-none focus:border-accent/40"
          >
            <option value="">{bulkBusy ? "Moving…" : "Move selected → group…"}</option>
            {assignTargets!.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button
            onClick={() => deleteRows(shown.filter((r) => selected.has(rowKey(r))))}
            disabled={bulkBusy}
            className="rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-200 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
          >
            🗑 Delete selected
          </button>
          <button onClick={() => setSelected(new Set())} className="text-muted-dim hover:text-foreground">
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-[800px] text-left text-xs">
          <thead className="border-b border-white/5 bg-white/[0.02] text-[10px] uppercase tracking-wide text-muted-dim">
            <tr>
              {hasAssign && (
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={shown.length > 0 && shown.every((r) => selected.has(rowKey(r)))}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(shown.map(rowKey)) : new Set())
                    }
                  />
                </th>
              )}
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Subdomain</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">CDN</th>
              <th className="px-3 py-2">Ports</th>
              <th className="px-3 py-2">Tech</th>
              <th className="px-3 py-2">CVEs / findings</th>
              {assignTargets && assignTargets.length > 0 && <th className="px-3 py-2">Group</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const key = rowKey(r);
              const isExpanded = expandedKey === key;
              return (
              <Fragment key={key}>
              <tr key={key} className="border-b border-white/[0.03] align-top hover:bg-white/[0.02]">
                {hasAssign && (
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(rowKey(r))} onChange={() => toggle(rowKey(r))} />
                  </td>
                )}
                <td className="px-3 py-2">
                  {r.risk === null ? (
                    <span className="text-muted-dim">—</span>
                  ) : (
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold ${
                        r.risk >= 70
                          ? "bg-rose-500/15 text-rose-300"
                          : r.risk >= 40
                            ? "bg-amber-500/15 text-amber-300"
                            : r.risk >= 15
                              ? "bg-violet-500/15 text-violet-300"
                              : "bg-white/5 text-muted-dim"
                      }`}
                      title="Risk score 0–100 (ports + CVEs + findings)"
                    >
                      {r.risk}
                    </span>
                  )}
                </td>
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
                        <button
                          type="button"
                          onClick={() => setExpandedKey(isExpanded ? null : key)}
                          className="mt-1 w-fit rounded-md border border-accent/20 bg-accent/10 px-2 py-1 text-left text-[10px] font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent/20"
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? "Hide details" : `+${r.findings.length - 8} more — open IP card`}
                        </button>
                      )}
                    </div>
                  )}
                </td>
                {assignTargets && assignTargets.length > 0 && (
                  <td className="px-3 py-2">
                    <select
                      defaultValue=""
                      disabled={assigning === (r.subId ?? r.hostId ?? "")}
                      onChange={(e) => { assign(r, e.target.value); e.target.value = ""; }}
                      className="rounded-md border border-white/10 bg-background px-1.5 py-1 text-[10px] outline-none focus:border-accent/40"
                    >
                      <option value="">→ group…</option>
                      {assignTargets.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
              {isExpanded && (
                <tr key={`${key}-details`} className="border-b border-accent/20 bg-accent/[0.03]">
                  <td colSpan={hasAssign ? 9 : 8} className="p-3">
                    <div className="rounded-xl border border-accent/20 bg-surface p-4 shadow-lg shadow-accent/5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">Complete host details</p>
                          <h3 className="mt-1 font-mono text-lg font-semibold text-foreground">{r.ip ?? r.subdomain}</h3>
                          <p className="text-xs text-muted-dim">{r.subdomain}{r.title ? ` · ${r.title}` : ""}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedKey(null)}
                          className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-muted hover:text-foreground"
                        >
                          Close
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                        <Detail label="Risk" value={r.risk === null ? "—" : String(r.risk)} />
                        <Detail label="Status" value={r.host?.status ?? "—"} />
                        <Detail label="OS" value={r.host?.os_guess ?? "—"} />
                        <Detail label="Hostname" value={r.host?.hostname ?? "—"} />
                        <Detail label="CDN" value={r.cdn ?? "—"} />
                        <Detail label="WAF" value={r.host?.waf ?? "—"} />
                        <Detail label="ASN" value={r.host?.asn ?? "—"} />
                        <Detail label="Checked by" value={r.host?.checked_by ?? "—"} />
                        <Detail label="Last scanned" value={r.host?.last_scanned ?? "—"} />
                        <Detail label="SSL" value={r.host?.ssl_info ?? "—"} />
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <DetailList label="All ports" values={r.ports.map((p) => `${p.port}/${p.protocol}${p.service ? ` · ${p.service}` : ""}${p.version ? ` ${p.version}` : ""}`)} />
                        <DetailList label="Technology" values={r.tech} />
                        <DetailList label="All findings" values={r.findings.map((f) => `${f.severity}: ${f.cve ?? f.title}${f.source ? ` (${f.source})` : ""}`)} />
                        <DetailList label="Notes" values={r.host?.notes ? [r.host.notes] : []} />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <button
          onClick={() => setLimit((l) => l + 50)}
          className="mx-auto rounded-lg border border-white/10 px-4 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          Load more ({filtered.length - limit} remaining)
        </button>
      )}
    </div>
  );
}
