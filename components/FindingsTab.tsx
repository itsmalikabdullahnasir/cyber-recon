"use client";

import { useState } from "react";
import type { Finding, Host, Severity, FindingStatus } from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";
import { createClient } from "@/lib/supabase/client";

export function FindingsTab({
  targetId, hosts, findings,
}: {
  targetId: string; hosts: Host[]; findings: Finding[];
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
    setTitle(""); setType(""); setSeverity("Info"); setStatus("New");
    setHostId(""); setEvidence(""); setRemediation(""); setFoundBy("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setError(null); setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("findings").insert({
      target_id: targetId, host_id: hostId || null, title: title.trim(),
      type: type.trim() || null, severity, status,
      evidence: evidence.trim() || null, remediation: remediation.trim() || null,
      found_by: foundBy.trim() || null,
    });
    if (error) { setError(error.message); setLoading(false); return; }
    resetForm(); setAdding(false); setLoading(false); window.location.reload();
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
        <p className="text-[11px] font-medium text-muted-dim">
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="rounded-md border border-accent/20 bg-accent/8 px-3 py-1.5 text-xs font-medium text-accent transition-all hover:border-accent/30 hover:bg-accent/15 hover:shadow-[0_0_12px_rgba(168,85,247,0.15)]">
            + Add finding
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="flex flex-col gap-4 rounded-xl border border-accent/15 bg-surface p-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">New finding</h3>
            <button type="button" onClick={() => { setAdding(false); resetForm(); }} className="text-muted-dim hover:text-foreground">✕</button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Title <span className="text-rose-400">*</span></label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reflected XSS on login form" autoFocus className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none transition-all focus:border-accent/30" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Type</label>
              <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="XSS, SQLi, IDOR" className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none transition-all focus:border-accent/30" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30">
                <option>Info</option><option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as FindingStatus)} className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30">
                <option>New</option><option>Confirmed</option><option>Reported</option><option>Fixed</option><option>False Positive</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Host</label>
              <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30">
                <option value="">Not tied to a host</option>
                {hosts.map((h) => (<option key={h.id} value={h.id}>{h.ip}{h.services ? ` (${h.services})` : ""}</option>))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Found by</label>
              <input type="text" value={foundBy} onChange={(e) => setFoundBy(e.target.value)} placeholder="You" className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none transition-all focus:border-accent/30" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Evidence</label>
            <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="PoC, request/response, URLs..." rows={3} className="rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-xs outline-none transition-all focus:border-accent/30" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Remediation</label>
            <textarea value={remediation} onChange={(e) => setRemediation(e.target.value)} placeholder="How to fix this issue..." rows={2} className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none transition-all focus:border-accent/30" />
          </div>
          {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="rounded-lg bg-gradient-to-r from-accent to-fuchsia px-5 py-2 text-xs font-semibold text-white transition-all hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] disabled:opacity-50">
              {loading ? "Adding..." : "Add finding"}
            </button>
            <button type="button" onClick={() => { setAdding(false); resetForm(); }} className="rounded-lg border border-white/5 px-5 py-2 text-xs text-muted hover:border-white/10 hover:text-foreground">Cancel</button>
          </div>
        </form>
      )}

      {findings.length === 0 && !adding && (
        <button onClick={() => setAdding(true)} className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/8 px-8 py-16 text-center transition-all hover:border-accent/15 hover:bg-surface-hover">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.03] text-xl text-muted-dim">+</div>
          <p className="text-sm font-medium text-muted">Add your first finding</p>
          <p className="mt-1 text-[11px] text-muted-dim">Vulnerabilities, misconfigurations, issues</p>
        </button>
      )}

      {sortedFindings.length > 0 && (
        <div className="flex flex-col gap-1">
          {sortedFindings.map((f) => {
            const host = hosts.find((h) => h.id === f.host_id);
            return (
              <div key={f.id} className="group flex flex-col gap-2 rounded-lg border border-white/[0.03] px-4 py-3 transition-all hover:border-white/8 hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{f.title}</span>
                    {f.type && <span className="rounded-md border border-white/5 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-muted-dim">{f.type}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                    {host && <span className="font-mono">{host.ip}</span>}
                    {f.found_by && <span>by {f.found_by}</span>}
                    <span>{f.status}</span>
                  </div>
                  {f.evidence && <p className="mt-1.5 text-[11px] text-muted-dim/60 line-clamp-2 font-mono">{f.evidence}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <SeverityBadge value={f.severity} />
                  <button onClick={() => handleDelete(f.id)} disabled={deletingId === f.id} className="rounded-md p-1.5 text-muted-dim opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
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
