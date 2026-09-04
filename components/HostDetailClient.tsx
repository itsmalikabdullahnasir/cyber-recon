"use client";

import { useState } from "react";
import type {
  Host,
  Finding,
  Likelihood,
  HostStatus,
  Severity,
  FindingStatus,
} from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/types";
import { LikelihoodBadge } from "@/components/LikelihoodBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StatusDot } from "@/components/StatusDot";
import { createClient } from "@/lib/supabase/client";

export function HostDetailClient({
  host,
  findings,
}: {
  host: Host;
  findings: Finding[];
}) {
  const [ip, setIp] = useState(host.ip);
  const [status, setStatus] = useState<HostStatus>(host.status);
  const [ports, setPorts] = useState(host.open_ports ?? "");
  const [services, setServices] = useState(host.services ?? "");
  const [osGuess, setOsGuess] = useState(host.os_guess ?? "");
  const [exploitability, setExploitability] = useState<Likelihood>(
    host.exploitability
  );
  const [notes, setNotes] = useState(host.notes ?? "");
  const [checkedBy, setCheckedBy] = useState(host.checked_by ?? "");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const [fTitle, setFTitle] = useState("");
  const [fType, setFType] = useState("");
  const [fSeverity, setFSeverity] = useState<Severity>("Info");
  const [fStatus, setFStatus] = useState<FindingStatus>("New");
  const [fEvidence, setFEvidence] = useState("");
  const [fRemediation, setFRemediation] = useState("");
  const [fError, setFError] = useState<string | null>(null);
  const [fLoading, setFLoading] = useState(false);
  const [fAdding, setFAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("hosts")
      .update({
        ip,
        status,
        open_ports: ports || null,
        services: services || null,
        os_guess: osGuess || null,
        exploitability,
        notes: notes || null,
        checked_by: checkedBy || null,
      })
      .eq("id", host.id);
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleAddFinding(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitle.trim()) {
      setFError("Title is required");
      return;
    }
    setFError(null);
    setFLoading(true);

    const supabase = createClient();
    const { error } = await supabase.from("findings").insert({
      target_id: host.target_id,
      host_id: host.id,
      title: fTitle.trim(),
      type: fType.trim() || null,
      severity: fSeverity,
      status: fStatus,
      evidence: fEvidence.trim() || null,
      remediation: fRemediation.trim() || null,
    });

    if (error) {
      setFError(error.message);
      setFLoading(false);
      return;
    }

    setFTitle("");
    setFType("");
    setFEvidence("");
    setFRemediation("");
    setFAdding(false);
    setFLoading(false);
    window.location.reload();
  }

  async function handleDeleteFinding(findingId: string) {
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <StatusDot status={host.status} />
        <h1 className="font-mono text-xl font-semibold tracking-tight">
          {host.ip}
        </h1>
        <LikelihoodBadge value={host.exploitability} />
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">
              IP address
            </label>
            <input
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              className="rounded-md border border-white/10 bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as HostStatus)}
              className="rounded-md border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent/40"
            >
              <option>Live</option>
              <option>Down</option>
              <option>Filtered</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">
              Likelihood
            </label>
            <select
              value={exploitability}
              onChange={(e) =>
                setExploitability(e.target.value as Likelihood)
              }
              className="rounded-md border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent/40"
            >
              <option>Info</option>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">
              OS guess
            </label>
            <input
              type="text"
              value={osGuess}
              onChange={(e) => setOsGuess(e.target.value)}
              placeholder="e.g. Ubuntu 22.04"
              className="rounded-md border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Open ports</label>
          <input
            type="text"
            value={ports}
            onChange={(e) => setPorts(e.target.value)}
            placeholder="22, 80, 443, 3306"
            className="rounded-md border border-white/10 bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Services</label>
          <input
            type="text"
            value={services}
            onChange={(e) => setServices(e.target.value)}
            placeholder="SSH, HTTP, HTTPS, MySQL"
            className="rounded-md border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent/40"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">
              Checked by
            </label>
            <input
              type="text"
              value={checkedBy}
              onChange={(e) => setCheckedBy(e.target.value)}
              className="rounded-md border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">
              Last scanned
            </label>
            <input
              type="text"
              value={host.last_scanned ?? ""}
              disabled
              className="rounded-md border border-white/5 bg-surface/50 px-3 py-2 text-sm text-muted"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Observations, interesting findings, paths to explore..."
            className="rounded-md border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent/40"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-accent/80 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save changes"}
          </button>
          {saved && (
            <span className="text-xs text-emerald-400">Changes saved</span>
          )}
        </div>
      </form>

      <div className="border-t border-white/6 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Findings
            {findings.length > 0 && (
              <span className="ml-1.5 text-muted">({findings.length})</span>
            )}
          </h2>
          {!fAdding && (
            <button
              onClick={() => setFAdding(true)}
              className="rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              + Add finding
            </button>
          )}
        </div>

        {fAdding && (
          <form
            onSubmit={handleAddFinding}
            className="mt-3 flex flex-col gap-3 rounded-lg border border-accent/20 bg-surface p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
                placeholder="Finding title *"
                autoFocus
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              />
              <input
                type="text"
                value={fType}
                onChange={(e) => setFType(e.target.value)}
                placeholder="Type (XSS, SQLi, IDOR...)"
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              />
              <select
                value={fSeverity}
                onChange={(e) => setFSeverity(e.target.value as Severity)}
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              >
                <option>Info</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
              <select
                value={fStatus}
                onChange={(e) => setFStatus(e.target.value as FindingStatus)}
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              >
                <option>New</option>
                <option>Confirmed</option>
                <option>Reported</option>
                <option>Fixed</option>
                <option>False Positive</option>
              </select>
            </div>
            <textarea
              value={fEvidence}
              onChange={(e) => setFEvidence(e.target.value)}
              placeholder="Evidence / PoC"
              rows={2}
              className="rounded-md border border-white/10 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent/40"
            />
            <textarea
              value={fRemediation}
              onChange={(e) => setFRemediation(e.target.value)}
              placeholder="Remediation"
              rows={2}
              className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
            {fError && (
              <p className="text-xs text-red-400">{fError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={fLoading}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                {fLoading ? "Adding..." : "Add finding"}
              </button>
              <button
                type="button"
                onClick={() => setFAdding(false)}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {sortedFindings.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1">
            {sortedFindings.map((f) => (
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
                  <div className="mt-0.5 flex gap-x-3 text-xs text-muted">
                    <span>{f.status}</span>
                    {f.found_by && <span>by {f.found_by}</span>}
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
                    onClick={() => handleDeleteFinding(f.id)}
                    disabled={deletingId === f.id}
                    className="rounded p-1 text-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                  >
                    {deletingId === f.id ? "..." : "🗑"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !fAdding && (
            <p className="mt-3 text-xs text-muted">
              No findings for this host yet.
            </p>
          )
        )}
      </div>
    </div>
  );
}
