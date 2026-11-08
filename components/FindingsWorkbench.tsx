"use client";

import { useMemo, useState } from "react";
import type { Finding } from "@/lib/types";

const severityRank: Record<string, number> = { Critical: 5, High: 4, Medium: 3, Low: 2, Info: 1 };

export function FindingsWorkbench({ findings }: { findings: Finding[] }) {
  const [query, setQuery] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [sort, setSort] = useState<"severity" | "newest" | "cvss">("severity");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return findings
      .filter((finding) => !unresolvedOnly || !["Fixed", "False Positive"].includes(finding.status))
      .filter((finding) => !needle || [finding.title, finding.cve_id, finding.affected_url, finding.severity].some((value) => value?.toLowerCase().includes(needle)))
      .sort((a, b) => sort === "newest"
        ? b.created_at.localeCompare(a.created_at)
        : sort === "cvss"
          ? (b.cvss ?? 0) - (a.cvss ?? 0)
          : (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0));
  }, [findings, query, unresolvedOnly, sort]);

  function exportFindings() {
    const body = filtered.map((finding) => ({
      title: finding.title,
      severity: finding.severity,
      status: finding.status,
      cve: finding.cve_id,
      cvss: finding.cvss,
      affected_url: finding.affected_url,
      created_at: finding.created_at,
    }));
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "recon-findings.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Findings workbench</p>
          <h3 className="mt-1 text-lg font-semibold">Issues requiring attention</h3>
          <p className="mt-1 text-xs text-muted-dim">{filtered.length.toLocaleString()} findings match the current view.</p>
        </div>
        <button type="button" onClick={exportFindings} disabled={!filtered.length} className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted disabled:opacity-40">Export JSON</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, CVE, URL…" className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-background px-3 py-2 text-xs outline-none focus:border-accent/40" />
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-lg border border-white/10 bg-background px-3 py-2 text-xs">
          <option value="severity">Highest severity</option><option value="newest">Newest</option><option value="cvss">Highest CVSS</option>
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-muted">
          <input type="checkbox" checked={unresolvedOnly} onChange={(event) => setUnresolvedOnly(event.target.checked)} /> Unresolved
        </label>
      </div>
      <div className="mt-4 space-y-2">
        {filtered.slice(0, 12).map((finding) => (
          <div key={finding.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-background/20 px-3 py-2">
            <span className={`w-16 text-[10px] font-bold uppercase ${finding.severity === "Critical" ? "text-rose-300" : finding.severity === "High" ? "text-pink-300" : "text-amber-300"}`}>{finding.severity}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{finding.title}</span>
            {finding.cve_id && <span className="font-mono text-[10px] text-accent">{finding.cve_id}</span>}
            {finding.cvss !== null && <span className="text-[10px] text-muted-dim">CVSS {finding.cvss}</span>}
            <span className="text-[10px] text-muted-dim">{finding.status}</span>
          </div>
        ))}
        {!filtered.length && <p className="py-8 text-center text-xs text-muted-dim">No findings match this view.</p>}
      </div>
    </section>
  );
}
