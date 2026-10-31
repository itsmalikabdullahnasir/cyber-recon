"use client";

import { useEffect, useState } from "react";
import type { Scan, ScopeEntry } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { ScanRow } from "@/components/ScanRow";

export function ScanLauncher({
  targetId,
  domain,
  inScope,
  scopeEntries,
  initialScans,
}: {
  targetId: string;
  domain: string | null;
  inScope: boolean;
  scopeEntries: ScopeEntry[];
  initialScans: Scan[];
}) {
  const [scans, setScans] = useState<Scan[]>(initialScans);
  const [override, setOverride] = useState("");
  const [launching, setLaunching] = useState<null | "passive" | "full">(null);
  const [error, setError] = useState<string | null>(null);

  // Live updates: subscribe to this target's scan rows.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`scans:${targetId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scans", filter: `target_id=eq.${targetId}` },
        (payload) => {
          const row = payload.new as Scan;
          setScans((prev) => {
            const rest = prev.filter((s) => s.id !== row.id);
            return [row, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10);
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetId]);

  async function launch(mode: "passive" | "full") {
    // Warn if this exact target already has a scan — but let the user continue.
    const input = override.trim() || domain || "";
    const dup = scans.find((s) => s.input === input);
    if (
      dup &&
      !confirm(
        `A ${dup.mode} scan for "${input}" already exists (${dup.status}, ${new Date(dup.created_at).toLocaleString()}).\n\nRun it again anyway?`,
      )
    ) {
      return;
    }
    setError(null);
    setLaunching(mode);
    try {
      const res = await fetch("/api/recon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId, mode, target: override.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ? `${data.error}: ${data.detail}` : data.error || "Failed to start scan");
      }
    } catch {
      setError("Could not reach the app server");
    } finally {
      setLaunching(null);
    }
  }

  const activeScan = scans.find((s) => s.status === "queued" || s.status === "running");
  const canFull = inScope && scopeEntries.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/5 bg-surface p-4">
        <h3 className="text-sm font-semibold">Run recon on the VM</h3>
        <p className="mt-0.5 text-[11px] text-muted-dim">
          The scan runs on your Oracle recon box and streams results back here. One scan at a time.
        </p>

        <input
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          placeholder={domain || "domain or public IP to scan"}
          className="mt-3 w-full rounded-lg border border-white/10 bg-background px-3 py-2 font-mono text-sm"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => launch("passive")}
            disabled={launching !== null || !!activeScan}
            className="rounded-lg border border-accent/30 bg-accent/15 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-40"
          >
            {launching === "passive" ? "Starting…" : "Passive scan"}
          </button>
          <button
            onClick={() => launch("full")}
            disabled={launching !== null || !!activeScan || !canFull}
            title={canFull ? "" : "Mark the target In Scope and add scope entries to enable active scanning"}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-40"
          >
            {launching === "full" ? "Starting…" : "Full scan (active)"}
          </button>
          {activeScan && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              {activeScan.status === "queued" ? "Queued…" : `Running: ${activeScan.stage ?? "starting"}`}
            </span>
          )}
        </div>
        {!canFull && (
          <p className="mt-2 text-[11px] text-muted-dim">
            Active scan needs the target marked <span className="text-foreground">In Scope</span> and at least one scope entry.
          </p>
        )}
        {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      </div>

      {scans.length > 0 && (
        <div className="flex flex-col gap-2">
          {scans.map((scan) => (
            <ScanRow key={scan.id} scan={scan} />
          ))}
        </div>
      )}
    </div>
  );
}
