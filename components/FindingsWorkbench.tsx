"use client";

import { useCallback, useEffect, useState } from "react";
import type { Finding, Severity } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type Sort = "severity" | "newest" | "cvss";
const PAGE_SIZE = 25;

function downloadRows(rows: Finding[], format: "json" | "csv") {
  const values = rows.map((finding) => ({
    title: finding.title,
    severity: finding.severity,
    status: finding.status,
    cve: finding.cve_id,
    cvss: finding.cvss,
    affected_url: finding.affected_url,
    created_at: finding.created_at,
  }));
  const body = format === "json"
    ? JSON.stringify(values, null, 2)
    : [
        Object.keys(values[0] ?? {}).join(","),
        ...values.map((row) => Object.values(row).map((value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`).join(",")),
      ].join("\n");
  const blob = new Blob([body], { type: format === "json" ? "application/json" : "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `recon-findings.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function FindingsWorkbench({ findings: initialFindings }: { findings: Finding[] }) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "All">("All");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [sort, setSort] = useState<Sort>("severity");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Finding[]>(initialFindings.slice(0, PAGE_SIZE));
  const [total, setTotal] = useState(initialFindings.length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("get_findings_page", {
      p_search: query || null,
      p_severity: severity === "All" ? null : severity,
      p_unresolved_only: unresolvedOnly,
      p_sort: sort,
      p_page: page,
      p_page_size: PAGE_SIZE,
    });
    if (rpcError || !data) {
      setError(rpcError?.message ?? "Could not load findings.");
      if (page === 1 && !query && severity === "All" && unresolvedOnly) {
        setRows(initialFindings.slice(0, PAGE_SIZE));
        setTotal(initialFindings.length);
      }
    } else {
      const result = data as { rows?: Finding[]; total?: number };
      setRows(result.rows ?? []);
      setTotal(result.total ?? 0);
    }
    setLoading(false);
  }, [initialFindings, page, query, severity, sort, unresolvedOnly]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Findings workbench</p>
          <h3 className="mt-1 text-lg font-semibold">Issues requiring attention</h3>
          <p className="mt-1 text-xs text-muted-dim">{total.toLocaleString()} findings match the current view.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => downloadRows(rows, "csv")} disabled={!rows.length} className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted disabled:opacity-40">CSV</button>
          <button type="button" onClick={() => downloadRows(rows, "json")} disabled={!rows.length} className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted disabled:opacity-40">JSON</button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search title, CVE, URL…" className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-background px-3 py-2 text-xs outline-none focus:border-accent/40" />
        <select value={severity} onChange={(event) => { setSeverity(event.target.value as Severity | "All"); setPage(1); }} className="rounded-lg border border-white/10 bg-background px-3 py-2 text-xs">
          <option value="All">All severities</option><option value="Critical">Critical</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option><option value="Info">Info</option>
        </select>
        <select value={sort} onChange={(event) => { setSort(event.target.value as Sort); setPage(1); }} className="rounded-lg border border-white/10 bg-background px-3 py-2 text-xs">
          <option value="severity">Highest severity</option><option value="newest">Newest</option><option value="cvss">Highest CVSS</option>
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-muted">
          <input type="checkbox" checked={unresolvedOnly} onChange={(event) => { setUnresolvedOnly(event.target.checked); setPage(1); }} /> Unresolved
        </label>
      </div>
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      <div className="mt-4 space-y-2">
        {loading && <p className="py-4 text-center text-xs text-muted-dim">Loading findings…</p>}
        {!loading && rows.map((finding) => (
          <div key={finding.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-background/20 px-3 py-2">
            <span className={`w-16 text-[10px] font-bold uppercase ${finding.severity === "Critical" ? "text-rose-300" : finding.severity === "High" ? "text-pink-300" : "text-amber-300"}`}>{finding.severity}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{finding.title}</span>
            {finding.cve_id && <span className="font-mono text-[10px] text-accent">{finding.cve_id}</span>}
            {finding.cvss !== null && <span className="text-[10px] text-muted-dim">CVSS {finding.cvss}</span>}
            <span className="text-[10px] text-muted-dim">{finding.status}</span>
          </div>
        ))}
        {!loading && !rows.length && <p className="py-8 text-center text-xs text-muted-dim">No findings match this view.</p>}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-dim">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Previous</button>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>
    </section>
  );
}
