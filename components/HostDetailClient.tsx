"use client";

import { useState } from "react";
import type { Host, Finding, Likelihood, HostStatus, Severity, FindingStatus } from "@/lib/types";
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
  const [exploitability, setExploitability] = useState<Likelihood>(host.exploitability);
  const [notes, setNotes] = useState(host.notes ?? "");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const [fTitle, setFTitle] = useState("");
  const [fType, setFType] = useState("");
  const [fSeverity, setFSeverity] = useState<Severity>("Info");
  const [fStatus, setFStatus] = useState<FindingStatus>("New");
  const [fEvidence, setFEvidence] = useState("");
  const [fError, setFError] = useState<string | null>(null);
  const [fLoading, setFLoading] = useState(false);

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
        exploitability,
        notes: notes || null,
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
    });

    if (error) {
      setFError(error.message);
      setFLoading(false);
      return;
    }

    setFTitle("");
    setFType("");
    setFEvidence("");
    setFLoading(false);
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <StatusDot status={host.status} />
        <h1 className="font-mono text-lg font-semibold tracking-tight">
          {host.ip}
        </h1>
        <LikelihoodBadge value={host.exploitability} />
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">IP</label>
            <input
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              className="rounded-md border border-white/10 bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Status</label>
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
            <label className="text-xs text-muted">Likelihood</label>
            <select
              value={exploitability}
              onChange={(e) => setExploitability(e.target.value as Likelihood)}
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
            <label className="text-xs text-muted">Open ports</label>
            <input
              type="text"
              value={ports}
              onChange={(e) => setPorts(e.target.value)}
              className="rounded-md border border-white/10 bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent/40"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">Services</label>
          <input
            type="text"
            value={services}
            onChange={(e) => setServices(e.target.value)}
            className="rounded-md border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-md border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent/40"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-accent/80 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save changes"}
          </button>
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
        </div>
      </form>

      <div className="border-t border-white/6 pt-6">
        <h2 className="mb-3 text-sm font-medium">Findings for this host</h2>

        <form onSubmit={handleAddFinding} className="mb-4 flex flex-col gap-3 rounded-lg border border-white/10 bg-surface p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <input
              type="text"
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              placeholder="Title"
              className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
            <input
              type="text"
              value={fType}
              onChange={(e) => setFType(e.target.value)}
              placeholder="Type"
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
            placeholder="Evidence"
            rows={2}
            className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
          />
          {fError && <p className="text-xs text-red-400">{fError}</p>}
          <button
            type="submit"
            disabled={fLoading}
            className="self-start rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-accent/80 disabled:opacity-50"
          >
            {fLoading ? "Adding..." : "Add finding"}
          </button>
        </form>

        {findings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/6 text-xs text-muted">
                  <th className="pb-2 font-medium">Title</th>
                  <th className="pb-2 font-medium">Severity</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-white/4 transition-colors hover:bg-surface-hover"
                  >
                    <td className="py-2.5 text-sm">{f.title}</td>
                    <td className="py-2.5">
                      <SeverityBadge value={f.severity} />
                    </td>
                    <td className="py-2.5 text-xs text-muted">{f.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted">No findings for this host yet.</p>
        )}
      </div>
    </div>
  );
}
