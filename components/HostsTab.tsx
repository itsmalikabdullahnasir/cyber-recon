"use client";

import { useState } from "react";
import Link from "next/link";
import type { Host, Likelihood, HostStatus } from "@/lib/types";
import { LIKELIHOOD_ORDER } from "@/lib/types";
import { StatusDot } from "@/components/StatusDot";
import { LikelihoodBadge } from "@/components/LikelihoodBadge";
import { createClient } from "@/lib/supabase/client";

export function HostsTab({
  targetId,
  hosts,
}: {
  targetId: string;
  hosts: Host[];
}) {
  const [adding, setAdding] = useState(false);
  const [ip, setIp] = useState("");
  const [hostStatus, setHostStatus] = useState<HostStatus>("Live");
  const [ports, setPorts] = useState("");
  const [services, setServices] = useState("");
  const [osGuess, setOsGuess] = useState("");
  const [exploitability, setExploitability] = useState<Likelihood>("Info");
  const [notes, setNotes] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setIp("");
    setHostStatus("Live");
    setPorts("");
    setServices("");
    setOsGuess("");
    setExploitability("Info");
    setNotes("");
    setCheckedBy("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!ip.trim()) {
      setError("IP address is required");
      return;
    }
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.from("hosts").insert({
      target_id: targetId,
      ip: ip.trim(),
      status: hostStatus,
      open_ports: ports.trim() || null,
      services: services.trim() || null,
      os_guess: osGuess.trim() || null,
      exploitability,
      notes: notes.trim() || null,
      checked_by: checkedBy.trim() || null,
      last_scanned: new Date().toISOString().split("T")[0],
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

  async function handleDelete(hostId: string) {
    if (!confirm("Delete this host and all its findings?")) return;
    setDeletingId(hostId);
    const supabase = createClient();
    await supabase.from("hosts").delete().eq("id", hostId);
    window.location.reload();
  }

  const sortedHosts = [...hosts].sort(
    (a, b) =>
      LIKELIHOOD_ORDER[b.exploitability] - LIKELIHOOD_ORDER[a.exploitability]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {hosts.length} host{hosts.length !== 1 ? "s" : ""}
          {hosts.length > 0 && (
            <span className="ml-2 text-muted/60">
              · sorted by risk
            </span>
          )}
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            + Add host
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-4 rounded-lg border border-accent/20 bg-surface p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">New host</h3>
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
                IP address <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="111.68.99.1"
                autoFocus
                className="rounded-md border border-white/10 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">
                Status
              </label>
              <select
                value={hostStatus}
                onChange={(e) => setHostStatus(e.target.value as HostStatus)}
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
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
              <label className="text-xs font-medium text-muted">
                OS guess
              </label>
              <input
                type="text"
                value={osGuess}
                onChange={(e) => setOsGuess(e.target.value)}
                placeholder="e.g. Ubuntu 22.04"
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">
              Open ports
            </label>
            <input
              type="text"
              value={ports}
              onChange={(e) => setPorts(e.target.value)}
              placeholder="22, 80, 443, 3306, 8080"
              className="rounded-md border border-white/10 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/40"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">
              Services
            </label>
            <input
              type="text"
              value={services}
              onChange={(e) => setServices(e.target.value)}
              placeholder="SSH, HTTP, HTTPS, MySQL, Apache Tomcat"
              className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
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
                placeholder="e.g. You"
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Quick notes about this host"
                className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
              />
            </div>
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
              {loading ? "Adding..." : "Add host"}
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

      {hosts.length === 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 px-8 py-16 text-center transition-colors hover:border-accent/30 hover:bg-surface"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-lg text-muted">
            +
          </div>
          <p className="text-sm text-muted">Add your first host</p>
          <p className="mt-1 text-xs text-muted/60">
            IP addresses, domains, servers — anything with an IP
          </p>
        </button>
      )}

      {sortedHosts.length > 0 && (
        <div className="flex flex-col gap-1">
          {sortedHosts.map((h) => (
            <Link
              key={h.id}
              href={`/targets/${targetId}/hosts/${h.id}`}
              className="group flex items-center gap-4 rounded-lg border border-white/4 px-4 py-3 transition-colors hover:border-white/10 hover:bg-surface-hover"
            >
              <StatusDot status={h.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{h.ip}</span>
                  {h.os_guess && (
                    <span className="text-xs text-muted/60">
                      · {h.os_guess}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  {h.open_ports && (
                    <span className="font-mono">{h.open_ports}</span>
                  )}
                  {h.services && <span>{h.services}</span>}
                  {h.checked_by && <span>by {h.checked_by}</span>}
                </div>
              </div>
              <LikelihoodBadge value={h.exploitability} />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDelete(h.id);
                }}
                disabled={deletingId === h.id}
                className="rounded p-1 text-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                title="Delete host"
              >
                {deletingId === h.id ? "..." : "🗑"}
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
