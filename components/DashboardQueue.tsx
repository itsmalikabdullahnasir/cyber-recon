"use client";

import { useMemo, useState } from "react";
import type { Scan } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type Queue = { queued: number; running: number; done: number; failed: number };
type QueueFilter = "all" | "queued" | "running" | "done" | "failed";

function durationMinutes(scan: Scan): number | null {
  if (!scan.started_at || !scan.finished_at) return null;
  const value = (new Date(scan.finished_at).getTime() - new Date(scan.started_at).getTime()) / 60000;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function DashboardQueue({
  queue,
  scans,
  onRefresh,
}: {
  queue: Queue;
  scans: Scan[];
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const estimate = useMemo(() => {
    const durations = scans.map(durationMinutes).filter((value): value is number => value !== null);
    const average = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 5;
    return Math.max(1, Math.ceil(queue.queued * average));
  }, [queue.queued, scans]);

  const queuedPosition = useMemo(() => {
    const sorted = scans
      .filter((scan) => scan.status === "queued")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return new Map(sorted.map((scan, index) => [scan.id, index + 1]));
  }, [scans]);

  const visible = filter === "all" ? scans : scans.filter((scan) => scan.status === filter);

  async function runAction(action: "cancel" | "retry" | "clear") {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const query = action === "cancel"
      ? supabase.from("scans").update({ status: "failed", error: "cancelled by user", finished_at: new Date().toISOString() }).eq("status", "queued")
      : action === "retry"
        ? supabase.from("scans").update({ status: "queued", error: null, stage: null, stages: {}, started_at: null, finished_at: null }).eq("status", "failed")
        : supabase.from("scans").delete().in("status", ["done", "failed"]).lt("created_at", cutoff);
    const { error } = await query;
    setMessage(error ? error.message : action === "clear" ? "Old completed scans cleared." : "Queue updated.");
    setBusy(false);
    if (!error) onRefresh();
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Scan queue</p>
          <h3 className="mt-1 text-lg font-semibold">Worker capacity and backlog</h3>
          <p className="mt-1 text-xs text-muted-dim">
            {queue.queued > 0 ? `Estimated wait: about ${estimate >= 60 ? `${Math.floor(estimate / 60)}h ${estimate % 60}m` : `${estimate}m`}.` : "No queued work."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || queue.queued === 0} onClick={() => void runAction("cancel")} className="rounded-md border border-rose-500/30 px-2.5 py-1.5 text-[11px] text-rose-300 disabled:opacity-40">Cancel queued</button>
          <button type="button" disabled={busy || queue.failed === 0} onClick={() => void runAction("retry")} className="rounded-md border border-amber-500/30 px-2.5 py-1.5 text-[11px] text-amber-300 disabled:opacity-40">Retry failed</button>
          <button type="button" disabled={busy} onClick={() => void runAction("clear")} className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted disabled:opacity-40">Clear &gt;7d</button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {([
          ["all", "All", queue.queued + queue.running + queue.done + queue.failed],
          ["queued", "Queued", queue.queued],
          ["running", "Running", queue.running],
          ["done", "Completed", queue.done],
          ["failed", "Failed", queue.failed],
        ] as const).map(([key, label, value]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-lg border px-3 py-2 text-left ${filter === key ? "border-accent/40 bg-accent/10" : "border-white/5 bg-background/20"}`}>
            <p className="text-[10px] uppercase tracking-widest text-muted-dim">{label}</p>
            <p className="mt-1 text-lg font-bold">{value.toLocaleString()}</p>
          </button>
        ))}
      </div>
      {message && <p className="mt-3 text-xs text-muted-dim">{message}</p>}
      {visible.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-muted-dim">
              <tr><th className="pb-2">Target</th><th className="pb-2">Status</th><th className="pb-2">Position</th><th className="pb-2">Stage</th><th className="pb-2">Created</th></tr>
            </thead>
            <tbody>
              {visible.slice(0, 20).map((scan) => (
                <tr key={scan.id} className="border-t border-white/[0.04]">
                  <td className="py-2 font-mono">{scan.input}</td>
                  <td className="py-2 capitalize">{scan.status}</td>
                  <td className="py-2 text-muted-dim">{scan.status === "queued" ? `#${queuedPosition.get(scan.id) ?? "?"}` : "—"}</td>
                  <td className="py-2 text-muted-dim">{scan.stage ?? "waiting"}</td>
                  <td className="py-2 text-muted-dim">{new Date(scan.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
