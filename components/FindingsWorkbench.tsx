"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  assigned_to?: string | null;
  finding_priority?: string | null;
  sla_due_at?: string | null;
};

const PAGE_SIZE = 25;

function downloadRows(rows: FindingGroup[], format: "json" | "csv", filename = "recon-findings") {
  const values = rows.map((finding) => ({
    title: finding.title,
    severity: finding.severity,
    status: finding.status,
    priority: finding.finding_priority ?? "None",
    assignee: finding.assigned_to ?? "Unassigned",
    sla_due: finding.sla_due_at ?? "None",
    ip: finding.host_ip,
    domain: finding.target_domain,
    hostname: finding.host_hostname,
    url: finding.affected_url,
    cve: finding.cve_id,
    cvss: finding.cvss,
    occurrences: finding.occurrence_count,
    first_seen: finding.first_seen_at,
    last_seen: finding.last_seen_at,
  }));
  const body =
    format === "json"
      ? JSON.stringify(values, null, 2)
      : [
          Object.keys(values[0] ?? {}).join(","),
          ...values.map((row) =>
            Object.values(row)
              .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
              .join(",")
          ),
        ].join("\n");
  const blob = new Blob([body], { type: format === "json" ? "application/json" : "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function FindingsWorkbench({ findings: initialFindings }: { findings: Finding[] }) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "All">("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [recurrenceFilter, setRecurrenceFilter] = useState<"All" | "recurring" | "new">("All");
  const [assigneeFilter, setAssigneeFilter] = useState("All");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [sort, setSort] = useState<Sort>("severity");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<FindingGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<FindingGroup | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [teamMembers, setTeamMembers] = useState<Array<{ email: string; display_name: string }>>([]);

  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionPriority, setActionPriority] = useState("None");
  const [actionNotes, setActionNotes] = useState("");
  const [actionAssignee, setActionAssignee] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [total, setTotal] = useState(initialFindings.length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch team members list for assignments
  useEffect(() => {
    let active = true;
    void createClient()
      .rpc("get_team_members")
      .then(({ data }) => {
        if (!active) return;
        if (data && Array.isArray(data)) {
          setTeamMembers(data as Array<{ email: string; display_name: string }>);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const exportFiltered = async (format: "json" | "csv") => {
    setError(null);
    const { data, error: exportError } = await createClient().rpc("get_findings_export", {
      p_search: query || null,
      p_severity: severity === "All" ? null : severity,
      p_unresolved_only: unresolvedOnly,
    });
    if (exportError) {
      setError(exportError.message);
      return;
    }
    downloadRows((data as FindingGroup[]) ?? [], format, "recon-findings-filtered");
  };

  const exportSelected = (format: "json" | "csv") => {
    const selectedRows = rows.filter((r) => selectedGroups.has(r.group_id));
    if (selectedRows.length) {
      downloadRows(selectedRows, format, `recon-findings-selected-${selectedRows.length}`);
    }
  };

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

  // Client-side faceted filters
  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      if (statusFilter !== "All" && item.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      if (priorityFilter !== "All" && (item.finding_priority ?? "None") !== priorityFilter) {
        return false;
      }
      if (recurrenceFilter === "recurring" && !item.is_recurring) return false;
      if (recurrenceFilter === "new" && item.is_recurring) return false;
      if (assigneeFilter === "Unassigned" && item.assigned_to) return false;
      if (assigneeFilter !== "All" && assigneeFilter !== "Unassigned" && item.assigned_to !== assigneeFilter) {
        return false;
      }
      return true;
    });
  }, [rows, statusFilter, priorityFilter, recurrenceFilter, assigneeFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const action = async (groupIds: string[]) => {
    setActionLoading(true);
    setError(null);
    const { error: actionError } = await createClient().rpc(
      groupIds.length === 1 ? "update_findings_group" : "update_findings_groups",
      groupIds.length === 1
        ? {
            p_group_id: groupIds[0],
            p_status: actionStatus,
            p_priority: actionPriority,
            p_notes: actionNotes,
            p_assigned_to: actionAssignee,
          }
        : {
            p_group_ids: groupIds,
            p_status: actionStatus,
            p_priority: actionPriority,
            p_notes: actionNotes,
            p_assigned_to: actionAssignee,
          }
    );
    if (actionError) setError(actionError.message);
    else {
      setSelected(null);
      setSelectedGroups(new Set());
      await load();
    }
    setActionLoading(false);
  };

  const selectAllVisible = () => {
    if (selectedGroups.size === filteredRows.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(filteredRows.map((r) => r.group_id)));
    }
  };

  return (
    <section id="workbench" className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Findings Workbench</p>
          <h3 className="mt-1 text-lg font-semibold">Triage, Collaboration &amp; Vulnerability Lifecycle</h3>
          <p className="mt-1 text-xs text-muted-dim">
            {total.toLocaleString()} total findings indexed ({filteredRows.length} shown on current page).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedGroups.size > 0 && (
            <>
              <button
                type="button"
                onClick={() => exportSelected("csv")}
                className="rounded-md border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-[11px] text-accent"
              >
                Export Selected ({selectedGroups.size}) CSV
              </button>
              <button
                type="button"
                onClick={() => exportSelected("json")}
                className="rounded-md border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-[11px] text-accent"
              >
                Export Selected JSON
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => downloadRows(filteredRows, "csv")}
            disabled={!filteredRows.length}
            className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted hover:text-foreground disabled:opacity-40"
          >
            Page CSV
          </button>
          <button
            type="button"
            onClick={() => downloadRows(filteredRows, "json")}
            disabled={!filteredRows.length}
            className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted hover:text-foreground disabled:opacity-40"
          >
            Page JSON
          </button>
          <button
            type="button"
            onClick={() => void exportFiltered("csv")}
            disabled={loading}
            className="rounded-md border border-accent/20 px-2.5 py-1.5 text-[11px] text-accent hover:bg-accent/10 disabled:opacity-40"
          >
            All Filtered CSV
          </button>
          <button
            type="button"
            onClick={() => void exportFiltered("json")}
            disabled={loading}
            className="rounded-md border border-accent/20 px-2.5 py-1.5 text-[11px] text-accent hover:bg-accent/10 disabled:opacity-40"
          >
            All Filtered JSON
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search CVE, title, host, domain, URL..."
          className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-background px-3 py-2 outline-none focus:border-accent/40"
        />

        <select
          value={severity}
          onChange={(event) => {
            setSeverity(event.target.value as Severity | "All");
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-background px-3 py-2"
        >
          <option value="All">All Severities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
          <option value="Info">Info</option>
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border border-white/10 bg-background px-3 py-2"
        >
          <option value="All">All Statuses</option>
          <option value="New">New</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Reported">Reported</option>
          <option value="Fixed">Fixed</option>
          <option value="False Positive">False Positive</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value)}
          className="rounded-lg border border-white/10 bg-background px-3 py-2"
        >
          <option value="All">All Priorities</option>
          <option value="Critical">Critical Priority</option>
          <option value="High">High Priority</option>
          <option value="Medium">Medium Priority</option>
          <option value="Low">Low Priority</option>
          <option value="None">No Priority</option>
        </select>

        <select
          value={recurrenceFilter}
          onChange={(event) => setRecurrenceFilter(event.target.value as "All" | "recurring" | "new")}
          className="rounded-lg border border-white/10 bg-background px-3 py-2"
        >
          <option value="All">All Recurrences</option>
          <option value="recurring">Recurring Only</option>
          <option value="new">First Seen Only</option>
        </select>

        <select
          value={assigneeFilter}
          onChange={(event) => setAssigneeFilter(event.target.value)}
          className="rounded-lg border border-white/10 bg-background px-3 py-2"
        >
          <option value="All">All Assignees</option>
          <option value="Unassigned">Unassigned Only</option>
          {teamMembers.map((m) => (
            <option key={m.email} value={m.email}>
              {m.display_name} ({m.email})
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as Sort);
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-background px-3 py-2"
        >
          <option value="severity">Highest Severity</option>
          <option value="newest">Newest First</option>
          <option value="cvss">Highest CVSS</option>
        </select>

        <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-muted">
          <input
            type="checkbox"
            checked={unresolvedOnly}
            onChange={(event) => {
              setUnresolvedOnly(event.target.checked);
              setPage(1);
            }}
          />
          Unresolved Only
        </label>
      </div>

      {/* Bulk Update Bar */}
      {selectedGroups.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 p-2.5 text-xs">
          <span className="font-semibold text-accent">{selectedGroups.size} findings selected</span>
          <select
            value={actionStatus ?? ""}
            onChange={(event) => setActionStatus(event.target.value || null)}
            className="rounded border border-white/10 bg-background px-2 py-1"
          >
            <option value="">Set Status</option>
            <option>Confirmed</option>
            <option>Fixed</option>
            <option>False Positive</option>
            <option>New</option>
          </select>

          <select
            value={actionPriority}
            onChange={(event) => setActionPriority(event.target.value)}
            className="rounded border border-white/10 bg-background px-2 py-1"
          >
            <option value="None">Priority: None</option>
            <option value="Low">Priority: Low</option>
            <option value="Medium">Priority: Medium</option>
            <option value="High">Priority: High</option>
            <option value="Critical">Priority: Critical</option>
          </select>

          <select
            value={actionAssignee}
            onChange={(event) => setActionAssignee(event.target.value)}
            className="rounded border border-white/10 bg-background px-2 py-1"
          >
            <option value="">Assign To...</option>
            {teamMembers.map((m) => (
              <option key={m.email} value={m.email}>
                {m.display_name}
              </option>
            ))}
          </select>

          <input
            value={actionNotes}
            onChange={(event) => setActionNotes(event.target.value)}
            placeholder="Bulk note (optional)"
            className="min-w-40 rounded border border-white/10 bg-background px-2 py-1"
          />

          <button
            type="button"
            disabled={actionLoading}
            onClick={() => void action([...selectedGroups])}
            className="rounded bg-accent px-3 py-1 font-semibold text-white disabled:opacity-40"
          >
            {actionLoading ? "Applying..." : "Apply Bulk Changes"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

      {/* Select All Toggle Header */}
      {filteredRows.length > 0 && (
        <div className="mt-4 flex items-center justify-between border-b border-white/5 pb-2 text-xs text-muted-dim">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedGroups.size > 0 && selectedGroups.size === filteredRows.length}
              onChange={selectAllVisible}
            />
            <span>Select all {filteredRows.length} on page</span>
          </label>
          <span>Click any finding row to view investigation drawer &amp; timeline</span>
        </div>
      )}

      {/* Findings List */}
      <div className="mt-2 space-y-2">
        {loading && <p className="py-6 text-center text-xs text-muted-dim">Loading findings...</p>}

        {!loading &&
          filteredRows.map((finding) => (
            <div
              key={finding.group_id}
              className={`rounded-lg border px-3.5 py-2.5 transition-colors ${
                selectedGroups.has(finding.group_id)
                  ? "border-accent/30 bg-accent/[0.04]"
                  : "border-white/5 bg-background/20 hover:border-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[10px] text-muted-dim cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.has(finding.group_id)}
                    onChange={(event) =>
                      setSelectedGroups((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(finding.group_id);
                        else next.delete(finding.group_id);
                        return next;
                      })
                    }
                  />
                  <span>Select</span>
                </label>

                <div className="flex items-center gap-2 text-[10px]">
                  {finding.sla_due_at && (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-300">
                      SLA: {new Date(finding.sla_due_at).toLocaleDateString()}
                    </span>
                  )}
                  {finding.assigned_to && (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-muted">
                      Assigned: {finding.assigned_to.split("@")[0]}
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] uppercase font-bold ${
                      finding.is_recurring ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {finding.is_recurring ? "Recurring" : "New"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelected(finding)}
                className="mt-1 flex w-full flex-wrap items-center gap-3 text-left"
              >
                <span
                  className={`w-16 text-[10px] font-bold uppercase ${
                    finding.severity === "Critical"
                      ? "text-rose-400"
                      : finding.severity === "High"
                        ? "text-pink-400"
                        : finding.severity === "Medium"
                          ? "text-amber-400"
                          : "text-blue-400"
                  }`}
                >
                  {finding.severity}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{finding.title}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-dim">
                    Asset:{" "}
                    <span className="font-mono text-muted">
                      {finding.host_ip ?? finding.host_hostname ?? "Unknown host"}
                    </span>{" "}
                    · Target:{" "}
                    <span className="text-muted">
                      {finding.target_domain ?? finding.target_name ?? "Unknown target"}
                    </span>
                  </p>
                  <p className="truncate text-[10px] text-muted-dim">
                    {finding.affected_url ? (
                      <span className="font-mono">{finding.affected_url}</span>
                    ) : (
                      "No affected URL recorded"
                    )}
                  </p>
                </div>

                {finding.cve_id && (
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                    {finding.cve_id}
                  </span>
                )}
                {finding.cvss !== null && (
                  <span className="text-[10px] text-muted-dim">CVSS {finding.cvss}</span>
                )}
                <span className="text-[10px] text-muted-dim">
                  {finding.occurrence_count} run{finding.occurrence_count === 1 ? "" : "s"}
                </span>
                <span className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-muted">
                  View Drawer →
                </span>
              </button>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.04] pt-2 text-[10px] text-muted-dim">
                <span>
                  First seen: {new Date(finding.first_seen_at).toLocaleDateString()} · Last seen:{" "}
                  {new Date(finding.last_seen_at).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(finding.group_id)) next.delete(finding.group_id);
                      else next.add(finding.group_id);
                      return next;
                    })
                  }
                  className="text-accent hover:underline"
                >
                  {expanded.has(finding.group_id) ? "Hide Occurrence History ▲" : "Show Occurrence History ▼"}
                </button>
              </div>

              {expanded.has(finding.group_id) && (
                <div className="mt-2.5 space-y-1.5 rounded bg-black/30 p-2 font-mono text-[10px]">
                  {finding.occurrences.map((occurrence) => (
                    <div
                      key={occurrence.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.03] pb-1 text-muted"
                    >
                      <span className="text-foreground">{occurrence.scan_input ?? "Target scan"}</span>
                      <span>Source: {occurrence.source ?? "worker"}</span>
                      <span className="capitalize">{occurrence.status}</span>
                      <span>{new Date(occurrence.created_at).toLocaleString()}</span>
                      <span className="text-muted-dim">Scan: {occurrence.scan_id?.slice(0, 8)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

        {!loading && !error && !filteredRows.length && (
          <p className="py-10 text-center text-xs text-muted-dim">
            No findings match the current filter criteria.
          </p>
        )}
      </div>

      {selected && (
        <FindingDetail
          finding={selected}
          teamMembers={teamMembers}
          onClose={() => setSelected(null)}
          onUpdated={() => void load()}
        />
      )}

      {/* Pagination Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-dim">
        <span>
          Page {page} of {totalPages} ({total} findings total)
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((v) => v - 1)}
            className="rounded border border-white/10 px-3 py-1 text-xs text-muted hover:text-foreground disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((v) => v + 1)}
            className="rounded border border-white/10 px-3 py-1 text-xs text-muted hover:text-foreground disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function FindingDetail({
  finding,
  teamMembers,
  onClose,
  onUpdated,
}: {
  finding: FindingGroup;
  teamMembers: Array<{ email: string; display_name: string }>;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [status, setStatus] = useState<string | null>(finding.status ?? null);
  const [priority, setPriority] = useState(finding.finding_priority ?? "None");
  const [notes, setNotes] = useState("");
  const [assignee, setAssignee] = useState(finding.assigned_to ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<
    Array<{ id: string; author_email?: string; body: string; created_at: string }>
  >([]);
  const [comment, setComment] = useState("");
  const [slaDueAt, setSlaDueAt] = useState(
    finding.sla_due_at ? new Date(finding.sla_due_at).toISOString().slice(0, 16) : ""
  );
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void createClient()
      .rpc("get_finding_comments", { p_group_id: finding.group_id })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        setComments((data as typeof comments) ?? []);
        setCommentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [finding.group_id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const { error: saveError } = await createClient().rpc("update_findings_group", {
      p_group_id: finding.group_id,
      p_status: status,
      p_priority: priority,
      p_notes: notes,
      p_assigned_to: assignee,
    });

    let mutationError = saveError;
    if (!mutationError && slaDueAt) {
      const { error: slaError } = await createClient().rpc("set_finding_sla", {
        p_group_id: finding.group_id,
        p_due_at: new Date(slaDueAt).toISOString(),
      });
      mutationError = slaError;
    }

    setError(mutationError?.message ?? null);
    setSaving(false);
    if (!mutationError) {
      if (onUpdated) onUpdated();
      onClose();
    }
  };

  const addComment = async () => {
    const findingId = finding.occurrences[0]?.id;
    if (!findingId || !comment.trim()) return;
    setCommentSaving(true);
    const { error: commentError } = await createClient().rpc("add_finding_comment", {
      p_finding_id: findingId,
      p_body: comment.trim(),
    });
    if (commentError) setError(commentError.message);
    else {
      setComment("");
      const { data } = await createClient().rpc("get_finding_comments", {
        p_group_id: finding.group_id,
      });
      setComments((data as typeof comments) ?? []);
    }
    setCommentSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Finding details"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-background p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
              Finding Investigation Drawer
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">{finding.title}</h3>
            <p className="mt-1 text-xs text-muted-dim">
              {finding.cve_id ?? "No CVE"} · {finding.severity} · Status: {finding.status}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/10 px-2.5 py-1 text-xs text-muted hover:text-foreground"
          >
            Close
          </button>
        </div>

        {/* Finding Metadata Grid */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Detail label="Target Host IP" value={finding.host_ip} />
          <Detail label="Hostname" value={finding.host_hostname} />
          <Detail label="Target Domain" value={finding.target_domain ?? finding.target_name} />
          <Detail label="Affected URL" value={finding.affected_url} />
          <Detail label="CVSS Score" value={finding.cvss?.toString()} />
          <Detail label="CWE Reference" value={finding.cwe} />
          <Detail label="First Seen" value={formatDate(finding.first_seen_at)} />
          <Detail label="Last Seen" value={formatDate(finding.last_seen_at)} />
        </div>

        <DetailBlock label="Vulnerability Evidence" value={finding.evidence} />
        <DetailBlock label="Remediation Guidance" value={finding.remediation} />

        {/* Lifecycle & Assignment Actions */}
        <section className="mt-6 rounded-lg border border-white/5 bg-surface/50 p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">
            Lifecycle &amp; SLA Management
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-dim">Status</label>
              <select
                value={status ?? ""}
                onChange={(event) => setStatus(event.target.value || null)}
                className="mt-1 w-full rounded border border-white/10 bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Keep status ({finding.status})</option>
                <option>Confirmed</option>
                <option>Fixed</option>
                <option>False Positive</option>
                <option>New</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-dim">Priority</label>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="mt-1 w-full rounded border border-white/10 bg-background px-2 py-1.5 text-xs"
              >
                <option>None</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-dim">Assignee</label>
              <select
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                className="mt-1 w-full rounded border border-white/10 bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.email} value={m.email}>
                    {m.display_name} ({m.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-dim">SLA Due Date</label>
              <input
                type="datetime-local"
                value={slaDueAt}
                onChange={(event) => setSlaDueAt(event.target.value)}
                className="mt-1 w-full rounded border border-white/10 bg-background px-2 py-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-dim">Investigation Notes</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add internal notes on root cause or remediation steps..."
              rows={2}
              className="mt-1 w-full rounded border border-white/10 bg-background p-2 text-xs"
            />
          </div>

          {error && <p className="text-xs text-rose-300">{error}</p>}

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {saving ? "Saving Changes..." : "Save Changes"}
          </button>
        </section>

        {/* Team Collaboration Comments */}
        <section className="mt-6 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">
            Team Activity &amp; Comments
          </h4>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            placeholder="Add an investigation comment or finding note..."
            className="w-full rounded border border-white/10 bg-background p-2 text-xs"
          />
          <button
            type="button"
            disabled={commentSaving || !comment.trim()}
            onClick={() => void addComment()}
            className="rounded border border-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-40"
          >
            {commentSaving ? "Posting..." : "Post Comment"}
          </button>

          <div className="mt-3 space-y-2 text-xs">
            {commentsLoading ? (
              <p className="text-muted-dim">Loading discussion...</p>
            ) : comments.length ? (
              comments.map((item) => (
                <div key={item.id} className="rounded border border-white/5 bg-background/30 p-2.5">
                  <p className="text-muted leading-relaxed">{item.body}</p>
                  <p className="mt-1.5 text-[10px] text-muted-dim">
                    {item.author_email ?? "Team member"} · {formatDate(item.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-muted-dim">No comments recorded yet.</p>
            )}
          </div>
        </section>

        {/* Associated Ports & Services */}
        <section className="mt-6 border-t border-white/5 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">
            Host Ports &amp; Detected Services
          </h4>
          <div className="mt-2 space-y-1 text-xs text-muted">
            {finding.host_ports && finding.host_ports.length ? (
              finding.host_ports.map((port) => (
                <div
                  key={`${port.port}-${port.protocol}`}
                  className="flex items-center justify-between rounded border border-white/5 bg-background/20 px-2 py-1"
                >
                  <span className="font-mono">
                    {port.port}/{port.protocol}
                  </span>
                  <span>{port.service ?? "unknown service"}</span>
                  <span className="text-muted-dim">
                    {port.product} {port.version}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-dim">No open port telemetry recorded for this host.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded border border-white/5 bg-background/20 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-dim">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-4 rounded border border-white/5 bg-background/20 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-dim">{label}</p>
      <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] text-muted">
        {value}
      </pre>
    </div>
  );
}
