"use client";

import { useState } from "react";
import type { Finding, Host, Severity, FindingStatus } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";
import { EmptyState } from "@/components/EmptyState";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setTitle("");
    setType("");
    setEvidence("");
    setRemediation("");
    setAdding(false);
    setLoading(false);
    window.location.reload();
  }

  if (findings.length === 0 && !adding) {
    return (
      <EmptyState
        message="No findings yet. Add your first finding to start documenting."
        actionLabel="Add finding"
        actionHref="#"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{findings.length} finding{findings.length !== 1 ? "s" : ""}</p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            + Add finding
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded-lg border border-white/10 bg-surface p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Finding title"
              className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Type (e.g. XSS, SQLi)"
              className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
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
          <select
            value={hostId}
            onChange={(e) => setHostId(e.target.value)}
            className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
          >
            <option value="">No specific host</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.ip}
              </option>
            ))}
          </select>
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Evidence"
            rows={2}
            className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
          />
          <textarea
            value={remediation}
            onChange={(e) => setRemediation(e.target.value)}
            placeholder="Remediation"
            rows={2}
            className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add finding"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {findings.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/6 text-xs text-muted">
                <th className="pb-2 font-medium">Title</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Severity</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Host</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => {
                const host = hosts.find((h) => h.id === f.host_id);
                return (
                  <tr
                    key={f.id}
                    className="border-b border-white/4 transition-colors hover:bg-surface-hover"
                  >
                    <td className="py-2.5 text-sm">{f.title}</td>
                    <td className="py-2.5 text-xs text-muted">{f.type || "—"}</td>
                    <td className="py-2.5">
                      <SeverityBadge value={f.severity} />
                    </td>
                    <td className="py-2.5 text-xs text-muted">{f.status}</td>
                    <td className="py-2.5 font-mono text-xs">
                      {host?.ip || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
