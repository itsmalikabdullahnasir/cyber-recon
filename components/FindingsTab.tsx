"use client";

import { useState } from "react";
import type { Finding, Host, Severity, FindingStatus } from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";
import { createClient } from "@/lib/supabase/client";

export function FindingsTab({
  targetId,
  hosts,
  findings,
}: {
  targetId: string;
  hosts: Host[];
  findings: Finding[];
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState<Severity>("Info");
  const [status, setStatus] = useState<FindingStatus>("New");
  const [hostId, setHostId] = useState<string>("");
  const [evidence, setEvidence] = useState("");
  const [remediation, setRemediation] = useState("");
  const [foundBy, setFoundBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setTitle("");
    setType("");
    setSeverity("Info");
    setStatus("New");
    setHostId("");
    setEvidence("");
    setRemediation("");
    setFoundBy("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.from("findings").insert({
      target_id: targetId,
      host_id: hostId || null,
      title: title.trim(),
      type: type.trim() || null,
      severity,
      status,
      evidence: evidence.trim() || null,
      remediation: remediation.trim() || null,
      found_by: foundBy.trim() || null,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    resetForm();
    setAdding(false);
    setLoading(false);
    window.location.reload();
  }

  async function handleDelete(findingId: string) {
    if (!confirm("Delete this finding?")) return;
    setDeletingId(findingId);
    const supabase = createClient();
    await supabase.from("findings").delete().eq("id", findingId);
    window.location.reload();
  }

  const sortedFindings = [...findings].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            + Add finding
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-4 rounded-lg border border-accent/20 bg-surface p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">New finding</h3>
            <button
              type="button"
              onClick={() => { setAdding(false); resetForm(); }}
              className="text-xs text-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Reflected XSS on login form"
                autoFocus
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">Type</label>
              <input
                type="text"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="e.g. XSS, SQLi, IDOR, misconfiguration"
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">
                Severity
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              >
                <option>Info</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as FindingStatus)}
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              >
                <option>New</option>
                <option>Confirmed</option>
                <option>Reported</option>
                <option>Fixed</option>
                <option>False Positive</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">
                Host (optional)
              </label>
              <select
                value={hostId}
                onChange={(e) => setHostId(e.target.value)}
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              >
                <option value="">Not tied to a host</option>
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.ip}
                    {h.services ? ` (${h.services})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">
                Found by
              </label>
              <input
                type="text"
                value={foundBy}
                onChange={(e) => setFoundBy(e.target.value)}
                placeholder="e.g. You"
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Evidence</label>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="PoC, request/response, screenshots, URLs..."
              rows={3}
              className="rounded-md border border-white/10 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent/40"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">
              Remediation
            </label>
            <textarea
              value={remediation}
              onChange={(e) => setRemediation(e.target.value)}
              placeholder="How to fix this issue..."
              rows={2}
              className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add finding"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); resetForm(); }}
              className="rounded-md border border-white/10 px-4 py-2 text-xs text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {findings.length === 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 px-8 py-16 text-center transition-colors hover:border-accent/30 hover:bg-surface"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-lg text-muted">
            +
          </div>
          <p className="text-sm text-muted">Add your first finding</p>
          <p className="mt-1 text-xs text-muted/60">
            Vulnerabilities, misconfigurations, issues
          </p>
        </button>
      )}

      {sortedFindings.length > 0 && (
        <div className="flex flex-col gap-1">
          {sortedFindings.map((f) => {
            const host = hosts.find((h) => h.id === f.host_id);
            return (
              <div
                key={f.id}
                className="group flex flex-col gap-1 rounded-lg border border-white/4 px-4 py-3 transition-colors hover:border-white/10 hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{f.title}</span>
                    {f.type && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
                        {f.type}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    {host && (
                      <span className="font-mono">{host.ip}</span>
                    )}
                    {f.found_by && <span>by {f.found_by}</span>}
                    <span>{f.status}</span>
                  </div>
                  {f.evidence && (
                    <p className="mt-1 text-xs text-muted/60 line-clamp-2 font-mono">
                      {f.evidence}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <SeverityBadge value={f.severity} />
                  <button
                    onClick={() => handleDelete(f.id)}
                    disabled={deletingId === f.id}
                    className="rounded p-1 text-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    title="Delete finding"
                  >
                    {deletingId === f.id ? "..." : "🗑"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
