"use client";

import { useState } from "react";
import Link from "next/link";
import type { Host, Likelihood, HostStatus } from "@/lib/types";
import { StatusDot } from "@/components/StatusDot";
import { LikelihoodBadge } from "@/components/LikelihoodBadge";
import { EmptyState } from "@/components/EmptyState";
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
  const [status, setStatus] = useState<HostStatus>("Live");
  const [ports, setPorts] = useState("");
  const [services, setServices] = useState("");
  const [exploitability, setExploitability] = useState<Likelihood>("Info");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!ip.trim()) {
      setError("IP is required");
      return;
    }
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.from("hosts").insert({
      target_id: targetId,
      ip: ip.trim(),
      status,
      open_ports: ports.trim() || null,
      services: services.trim() || null,
      exploitability,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setIp("");
    setPorts("");
    setServices("");
    setAdding(false);
    setLoading(false);
    window.location.reload();
  }

  if (hosts.length === 0 && !adding) {
    return (
      <EmptyState
        message="No hosts found. Add your first host to begin mapping."
        actionLabel="Add host"
        actionHref="#"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{hosts.length} host{hosts.length !== 1 ? "s" : ""}</p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            + Add host
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded-lg border border-white/10 bg-surface p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <input
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="IP address"
              className="rounded-md border border-white/10 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/40"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as HostStatus)}
              className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
            >
              <option>Live</option>
              <option>Down</option>
              <option>Filtered</option>
            </select>
            <select
              value={exploitability}
              onChange={(e) => setExploitability(e.target.value as Likelihood)}
              className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
            >
              <option>Info</option>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
            <input
              type="text"
              value={ports}
              onChange={(e) => setPorts(e.target.value)}
              placeholder="Open ports"
              className="rounded-md border border-white/10 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/40"
            />
          </div>
          <input
            type="text"
            value={services}
            onChange={(e) => setServices(e.target.value)}
            placeholder="Services (e.g. HTTP, SSH, MySQL)"
            className="rounded-md border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add host"}
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

      {hosts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/6 text-xs text-muted">
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">IP</th>
                <th className="pb-2 font-medium">Ports</th>
                <th className="pb-2 font-medium">Services</th>
                <th className="pb-2 font-medium">Likelihood</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h) => (
                <tr
                  key={h.id}
                  className="border-b border-white/4 transition-colors hover:bg-surface-hover"
                >
                  <td className="py-2.5">
                    <StatusDot status={h.status} />
                  </td>
                  <td className="py-2.5 font-mono text-xs">{h.ip}</td>
                  <td className="py-2.5 font-mono text-xs">
                    {h.open_ports || "—"}
                  </td>
                  <td className="py-2.5 text-xs">{h.services || "—"}</td>
                  <td className="py-2.5">
                    <LikelihoodBadge value={h.exploitability} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
