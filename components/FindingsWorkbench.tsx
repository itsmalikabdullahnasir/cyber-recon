"use client";

import { useCallback, useEffect, useState } from "react";
import type { Finding, Severity } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type Sort = "severity" | "newest" | "cvss";
type Occurrence = {
  id: string;
  scan_id: string | null;
  scan_input: string | null;
  scan_created_at: string | null;
  source: string | null;
  status: string;
  cvss: number | null;
  cwe: string | null;
  evidence: string | null;
  remediation: string | null;
  created_at: string;
};
type HostPort = {
  port: number;
  protocol: string;
  service: string | null;
  product: string | null;
  version: string | null;
};
type FindingGroup = {
  group_id: string;
  title: string;
  severity: Severity;
  status: string;
  cve_id: string | null;
  cvss: number | null;
  cwe: string | null;
  evidence: string | null;
  remediation: string | null;
  affected_url: string | null;
  target_name?: string | null;
  target_domain?: string | null;
  host_ip?: string | null;
  host_hostname?: string | null;
  host_ports?: HostPort[] | null;
  occurrence_count: number;
  is_recurring: boolean;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: Occurrence[];
};
const PAGE_SIZE = 25;

function downloadRows(rows: FindingGroup[], format: "json" | "csv") {
  const values = rows.map((finding) => ({
    title: finding.title,
    severity: finding.severity,
    status: finding.status,
    cve: finding.cve_id,
    cvss: finding.cvss,
    affected_url: finding.affected_url,
    target: finding.target_name ?? finding.target_domain,
    host: finding.host_ip ?? finding.host_hostname,
    occurrences: finding.occurrence_count,
    first_seen: finding.first_seen_at,
    last_seen: finding.last_seen_at,
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
  const [rows, setRows] = useState<FindingGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<FindingGroup | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionPriority, setActionPriority] = useState("None");
  const [actionNotes, setActionNotes] = useState("");
  const [actionAssignee, setActionAssignee] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [total, setTotal] = useState(initialFindings.length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("get_findings_groups", {
      p_search: query || null,
      p_severity: severity === "All" ? null : severity,
      p_unresolved_only: unresolvedOnly,
      p_sort: sort,
      p_page: page,
      p_page_size: PAGE_SIZE,
    });
    if (rpcError || !data) {
      setError(rpcError?.message ?? "Could not load findings.");
    } else {
      const result = data as { rows?: FindingGroup[]; total?: number };
      setRows(result.rows ?? []);
      setTotal(result.total ?? 0);
    }
    setLoading(false);
  }, [page, query, severity, sort, unresolvedOnly]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const action = async (groupIds: string[]) => {
    setActionLoading(true);
    setError(null);
    const { error: actionError } = await createClient().rpc(groupIds.length === 1 ? "update_findings_group" : "update_findings_groups", groupIds.length === 1 ? {
      p_group_id: groupIds[0], p_status: actionStatus, p_priority: actionPriority, p_notes: actionNotes, p_assigned_to: actionAssignee,
    } : {
      p_group_ids: groupIds, p_status: actionStatus, p_priority: actionPriority, p_notes: actionNotes, p_assigned_to: actionAssignee,
    });
    if (actionError) setError(actionError.message);
    else {
      setSelected(null);
      setSelectedGroups(new Set());
      await load();
    }
    setActionLoading(false);
  };

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
      {selectedGroups.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 p-2 text-xs">
          <span className="text-muted">{selectedGroups.size} selected</span>
          <select value={actionStatus ?? ""} onChange={(event) => setActionStatus(event.target.value || null)} className="rounded border border-white/10 bg-background px-2 py-1">
            <option value="">Set status</option><option>Confirmed</option><option>Fixed</option><option>False Positive</option><option>New</option>
          </select>
          <select value={actionPriority} onChange={(event) => setActionPriority(event.target.value)} className="rounded border border-white/10 bg-background px-2 py-1">
            <option>None</option><option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
          </select>
          <input value={actionAssignee} onChange={(event) => setActionAssignee(event.target.value)} placeholder="Team member" className="min-w-32 rounded border border-white/10 bg-background px-2 py-1" />
          <input value={actionNotes} onChange={(event) => setActionNotes(event.target.value)} placeholder="Notes (optional)" className="min-w-40 rounded border border-white/10 bg-background px-2 py-1" />
          <button type="button" disabled={actionLoading} onClick={() => void action([...selectedGroups])} className="rounded bg-accent px-2 py-1 text-white disabled:opacity-40">Apply</button>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      <div className="mt-4 space-y-2">
        {loading && <p className="py-4 text-center text-xs text-muted-dim">Loading findings…</p>}
        {!loading && rows.map((finding) => (
          <div key={finding.group_id} className="rounded-lg border border-white/5 bg-background/20 px-3 py-2">
            <label className="flex items-center gap-2 text-[10px] text-muted-dim">
              <input type="checkbox" checked={selectedGroups.has(finding.group_id)} onChange={(event) => setSelectedGroups((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(finding.group_id); else next.delete(finding.group_id);
                return next;
              })} />
              Select group for bulk update
            </label>
            <button type="button" onClick={() => setSelected(finding)} className="flex w-full flex-wrap items-center gap-3 text-left">
            <span className={`w-16 text-[10px] font-bold uppercase ${finding.severity === "Critical" ? "text-rose-300" : finding.severity === "High" ? "text-pink-300" : "text-amber-300"}`}>{finding.severity}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{finding.title}</p>
              <p className="mt-0.5 truncate text-[10px] text-muted-dim">
                Asset: {finding.host_ip ?? finding.host_hostname ?? "Unknown host"}
                {" · "}
                {finding.target_domain ?? finding.target_name ?? "Unknown target"}
              </p>
              <p className="truncate text-[10px] text-muted-dim">
                {finding.affected_url ? `URL: ${finding.affected_url}` : "No affected URL recorded"}
              </p>
            </div>
            {finding.cve_id && <span className="font-mono text-[10px] text-accent">{finding.cve_id}</span>}
            {finding.cvss !== null && <span className="text-[10px] text-muted-dim">CVSS {finding.cvss}</span>}
            <span className="text-[10px] text-muted-dim">{finding.occurrence_count} occurrence{finding.occurrence_count === 1 ? "" : "s"}</span>
            <span className={`text-[10px] ${finding.is_recurring ? "text-amber-300" : "text-muted-dim"}`}>{finding.is_recurring ? "Recurring" : "New"}</span>
            <span className="text-[10px] text-muted-dim">View details</span>
            </button>
            <button type="button" aria-label="Expand occurrences" onClick={() => setExpanded((current) => {
              const next = new Set(current);
              if (next.has(finding.group_id)) next.delete(finding.group_id);
              else next.add(finding.group_id);
              return next;
            })} className="mt-1 text-[10px] text-muted-dim">{expanded.has(finding.group_id) ? "Hide occurrences ▲" : "Show occurrences ▼"}</button>
            <p className="mt-1 text-[10px] text-muted-dim">First seen {new Date(finding.first_seen_at).toLocaleString()} · Last seen {new Date(finding.last_seen_at).toLocaleString()}</p>
            {expanded.has(finding.group_id) && (
              <div className="mt-2 space-y-1 border-t border-white/5 pt-2">
                {finding.occurrences.map((occurrence) => (
                  <div key={occurrence.id} className="flex flex-wrap gap-2 text-[10px] text-muted-dim">
                    <span>{occurrence.scan_input ?? "Unknown scan"}</span>
                    <span>{occurrence.source ?? "unknown source"}</span>
                    <span>{occurrence.status}</span>
                    <span>{new Date(occurrence.created_at).toLocaleString()}</span>
                    <span className="font-mono">{occurrence.scan_id ?? "no scan id"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {!loading && !rows.length && <p className="py-8 text-center text-xs text-muted-dim">No findings match this view.</p>}
      </div>
      {selected && <FindingDetail finding={selected} onClose={() => setSelected(null)} />}
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

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function FindingDetail({ finding, onClose }: { finding: FindingGroup; onClose: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [priority, setPriority] = useState("None");
  const [notes, setNotes] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    const { error: saveError } = await createClient().rpc("update_findings_group", {
      p_group_id: finding.group_id, p_status: status, p_priority: priority, p_notes: notes, p_assigned_to: assignee,
    });
    setError(saveError?.message ?? null);
    setSaving(false);
    if (!saveError) onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Finding details" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-background p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Finding detail</p>
            <h3 className="mt-1 text-lg font-semibold">{finding.title}</h3>
            <p className="mt-1 text-xs text-muted-dim">{finding.cve_id ?? "No CVE"} · {finding.severity} · {finding.status}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded border border-white/10 px-2 py-1 text-xs text-muted">Close</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Detail label="IP address" value={finding.host_ip} />
          <Detail label="Hostname" value={finding.host_hostname} />
          <Detail label="Domain" value={finding.target_domain ?? finding.target_name} />
          <Detail label="Affected URL" value={finding.affected_url} />
          <Detail label="CVSS" value={finding.cvss?.toString()} />
          <Detail label="CWE" value={finding.cwe} />
          <Detail label="First seen" value={formatDate(finding.first_seen_at)} />
          <Detail label="Last seen" value={formatDate(finding.last_seen_at)} />
        </div>
        <DetailBlock label="Evidence" value={finding.evidence} />
        <DetailBlock label="Remediation" value={finding.remediation} />
        <section className="mt-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">Lifecycle actions</h4>
          <div className="flex flex-wrap gap-2">
            <select value={status ?? ""} onChange={(event) => setStatus(event.target.value || null)} className="rounded border border-white/10 bg-background px-2 py-1 text-xs">
              <option value="">Keep status</option><option>Confirmed</option><option>Fixed</option><option>False Positive</option><option>New</option>
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value)} className="rounded border border-white/10 bg-background px-2 py-1 text-xs">
              <option>None</option><option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
            </select>
            <input value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Team member" className="min-w-32 rounded border border-white/10 bg-background px-2 py-1 text-xs" />
          </div>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add investigation notes..." rows={3} className="w-full rounded border border-white/10 bg-background p-2 text-xs" />
          {error && <p className="text-xs text-rose-300">{error}</p>}
          <button type="button" disabled={saving} onClick={() => void save()} className="rounded bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-40">{saving ? "Saving..." : "Save changes"}</button>
        </section>
        <section className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">Related host services and ports</h4>
          <div className="mt-2 space-y-1 text-xs text-muted">
            {finding.host_ports?.length ? finding.host_ports.map((port) => (
              <p key={`${port.protocol}-${port.port}`}>{port.port}/{port.protocol} · {port.service ?? port.product ?? "unknown"}{port.version ? ` ${port.version}` : ""}</p>
            )) : <p>No port data recorded.</p>}
          </div>
        </section>
        <section className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">Status history</h4>
          <div className="mt-2 space-y-2 border-l border-white/10 pl-3 text-xs text-muted">
            {[...finding.occurrences].reverse().map((occurrence) => (
              <p key={`${occurrence.id}-status`}><span className="font-medium text-foreground">{occurrence.status}</span> · {formatDate(occurrence.created_at)} · {occurrence.scan_input ?? "Unknown scan"}</p>
            ))}
          </div>
        </section>
        <section className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">Previous occurrences</h4>
          <div className="mt-2 space-y-2 text-xs text-muted">
            {finding.occurrences.map((occurrence) => (
              <p key={`${occurrence.id}-occurrence`}>{formatDate(occurrence.created_at)} · {occurrence.scan_input ?? "Unknown scan"} · {occurrence.scan_id ?? "No scan ID"}</p>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><p className="text-[10px] uppercase tracking-wider text-muted-dim">{label}</p><p className="mt-1 break-words text-xs text-muted">{value ?? "Not recorded"}</p></div>;
}

function DetailBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return <section className="mt-5"><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">{label}</h4><p className="mt-2 whitespace-pre-wrap rounded border border-white/5 bg-background/30 p-3 text-xs leading-5 text-muted">{value ?? "Not recorded"}</p></section>;
}
