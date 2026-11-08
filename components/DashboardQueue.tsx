"use client";

import { useEffect, useMemo, useState } from "react";
import type { Scan } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type Queue = { queued: number; running: number; done: number; failed: number };
type QueueFilter = "all" | "queued" | "running" | "done" | "failed";
type WorkerState = { ok: boolean; pending?: number | null; latencyMs?: number; error?: string };

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
  const [worker, setWorker] = useState<WorkerState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showWorkerHelp, setShowWorkerHelp] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/api/worker-health", { cache: "no-store" });
        const data = (await response.json()) as WorkerState;
        if (active) setWorker(data);
      } catch {
        if (active) setWorker({ ok: false, error: "Health check failed" });
      }
    };
    void check();
    const timer = setInterval(check, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const averageDuration = useMemo(() => {
    const durations = scans.map(durationMinutes).filter((value): value is number => value !== null);
    return durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 4;
  }, [scans]);

  const estimate = useMemo(() => {
    return Math.max(1, Math.ceil(queue.queued * averageDuration));
  }, [queue.queued, averageDuration]);

  const queuedPosition = useMemo(() => {
    const sorted = scans
      .filter((scan) => scan.status === "queued")
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.created_at.localeCompare(b.created_at));
    return new Map(sorted.map((scan, index) => [scan.id, index + 1]));
  }, [scans]);

  const visible = filter === "all" ? scans : scans.filter((scan) => scan.status === filter);
  const activeScan = scans.find((scan) => scan.status === "running");
  const heartbeatAge = activeScan?.worker_heartbeat_at
    ? Math.max(0, Math.round((now - new Date(activeScan.worker_heartbeat_at).getTime()) / 1000))
    : null;

  async function runAction(action: "cancel" | "retry" | "clear") {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const rpc =
      action === "cancel"
        ? supabase.rpc("cancel_queued_scans")
        : action === "retry"
          ? supabase.rpc("retry_failed_scans")
          : supabase.rpc("clear_old_scans", { p_days: 7 });
    const { data: changed, error } = await rpc;
    setMessage(
      error
        ? error.message
        : `${changed ?? 0} scan${changed === 1 ? "" : "s"} ${
            action === "clear" ? "cleared" : action === "cancel" ? "cancelled" : "re-queued"
          }.`
    );
    setBusy(false);
    if (!error) onRefresh();
  }

  async function cancelIndividualScan(scanId: string) {
    setBusy(true);
    const { error } = await createClient().rpc("cancel_scan", { p_scan_id: scanId });
    setMessage(error ? error.message : "Scan cancelled.");
    setBusy(false);
    if (!error) onRefresh();
  }

  async function retryIndividualScan(scanId: string) {
    setBusy(true);
    const { error } = await createClient().rpc("retry_scan", { p_scan_id: scanId });
    setMessage(error ? error.message : "Scan re-queued for execution.");
    setBusy(false);
    if (!error) onRefresh();
  }

  async function setPriority(scanId: string, value: string) {
    const priority = Number(value);
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) return;
    setBusy(true);
    const { error } = await createClient().rpc("set_scan_priority", {
      p_scan_id: scanId,
      p_priority: priority,
    });
    setMessage(error ? error.message : "Scan priority updated.");
    setBusy(false);
    if (!error) onRefresh();
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Scan Queue</p>
          <h3 className="mt-1 text-lg font-semibold">Worker Capacity &amp; Pipeline Backlog</h3>
          <p className="mt-1 text-xs text-muted-dim">
            {queue.queued > 0
              ? `Estimated queue drain: about ${
                  estimate >= 60 ? `${Math.floor(estimate / 60)}h ${estimate % 60}m` : `${estimate}m`
                } based on recent throughput.`
              : "No queued work in pipeline."}
          </p>
        </div>

        {/* Worker Status Indicator */}
        <div className="flex flex-col items-end gap-1.5">
          <div
            className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${
              worker?.ok
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
                : worker === null
                  ? "border-white/10 bg-white/[0.02] text-muted-dim"
                  : "border-rose-500/25 bg-rose-500/5 text-rose-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                worker?.ok ? "bg-emerald-400" : "bg-rose-400 animate-pulse"
              }`}
            />
            <span className="font-semibold">
              {worker?.ok ? "Worker Online" : worker === null ? "Checking..." : "Worker Offline"}
            </span>
            {worker?.ok ? (
              <span className="text-muted-dim">
                {worker.latencyMs ?? "—"}ms ·{" "}
                {heartbeatAge === null ? "idle heartbeat" : `heartbeat ${heartbeatAge}s ago`}
              </span>
            ) : (
              <span className="text-rose-200">{worker?.error ?? "Scans will queue until reconnect"}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowWorkerHelp(!showWorkerHelp)}
            className="text-[10px] text-muted hover:text-accent underline"
          >
            {showWorkerHelp ? "Hide Worker Guide ▲" : "Worker Restart Instructions ▼"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || queue.queued === 0}
            onClick={() => void runAction("cancel")}
            className="rounded-md border border-rose-500/30 px-2.5 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
          >
            Cancel Queued ({queue.queued})
          </button>
          <button
            type="button"
            disabled={busy || queue.failed === 0}
            onClick={() => void runAction("retry")}
            className="rounded-md border border-amber-500/30 px-2.5 py-1.5 text-[11px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
          >
            Retry Failed ({queue.failed})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction("clear")}
            className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted hover:text-foreground disabled:opacity-40"
          >
            Clear &gt;7d Scans
          </button>
        </div>
      </div>

      {/* Worker Restart Instructions Banner */}
      {showWorkerHelp && (
        <div className="mt-4 rounded-xl border border-white/10 bg-background/60 p-4 text-xs font-mono text-muted">
          <p className="font-sans font-semibold text-foreground">Worker Host Troubleshooting &amp; Reconnection:</p>
          <p className="mt-1 font-sans text-muted-dim">
            If the worker VM went offline or scans are not progressing, SSH into your scanning host and run:
          </p>
          <pre className="mt-2 rounded bg-black/40 p-2.5 text-[11px] text-emerald-300">
{`# 1. Check systemd service status
sudo systemctl status recon-worker

# 2. Restart the worker daemon
sudo systemctl restart recon-worker

# 3. Follow real-time worker logs
sudo journalctl -u recon-worker -f`}
          </pre>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(
          [
            ["all", "All", queue.queued + queue.running + queue.done + queue.failed],
            ["queued", "Queued", queue.queued],
            ["running", "Running", queue.running],
            ["done", "Completed", queue.done],
            ["failed", "Failed", queue.failed],
          ] as const
        ).map(([key, label, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              filter === key
                ? "border-accent/40 bg-accent/10"
                : "border-white/5 bg-background/20 hover:border-white/10"
            }`}
          >
            <p className="text-[10px] uppercase tracking-widest text-muted-dim">{label}</p>
            <p className="mt-1 text-lg font-bold">{value.toLocaleString()}</p>
          </button>
        ))}
      </div>

      {message && <p className="mt-3 text-xs text-accent">{message}</p>}

      {/* Scans Table */}
      {visible.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-muted-dim">
              <tr>
                <th className="pb-2.5">Target</th>
                <th className="pb-2.5">Status</th>
                <th className="pb-2.5">Position / ETA</th>
                <th className="pb-2.5">Priority</th>
                <th className="pb-2.5">Retries</th>
                <th className="pb-2.5">Pipeline Diagnostics</th>
                <th className="pb-2.5">Created</th>
                <th className="pb-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 25).map((scan) => {
                const pos = queuedPosition.get(scan.id);
                const isRunning = scan.status === "running";
                const isQueued = scan.status === "queued";
                const isFailed = scan.status === "failed";
                const scanStalled = isRunning && heartbeatAge !== null && heartbeatAge > 90;

                return (
                  <tr key={scan.id} className="border-t border-white/[0.04] hover:bg-white/[0.01]">
                    <td className="py-2.5 font-mono">
                      <a
                        href={`/scans/${scan.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="font-medium text-foreground hover:text-accent hover:underline"
                      >
                        {scan.input}
                      </a>
                      <span className="ml-2 text-[10px] text-muted-dim uppercase tracking-wider">
                        ({scan.mode})
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider ${
                          isRunning
                            ? "bg-amber-500/20 text-amber-300"
                            : scan.status === "done"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : isFailed
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-blue-500/20 text-blue-300"
                        }`}
                      >
                        {scan.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-muted-dim">
                      {isQueued && pos !== undefined ? (
                        <span>
                          <strong className="text-foreground">#{pos}</strong> (ETA ~
                          {Math.max(1, Math.round(pos * averageDuration))}m)
                        </span>
                      ) : isRunning ? (
                        <span className="text-amber-300 font-medium">In Progress</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5">
                      {isQueued ? (
                        <select
                          value={scan.priority ?? 0}
                          disabled={busy}
                          onChange={(event) => void setPriority(scan.id, event.target.value)}
                          className="rounded border border-white/10 bg-background px-1.5 py-0.5 text-[11px]"
                          title="Higher priority runs earlier in queue"
                        >
                          <option value="0">0 (Normal)</option>
                          <option value="25">25 (Medium)</option>
                          <option value="50">50 (High)</option>
                          <option value="75">75 (Urgent)</option>
                          <option value="100">100 (Immediate)</option>
                        </select>
                      ) : (
                        <span className="text-muted-dim">{scan.priority ?? 0}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-muted-dim">
                      {scan.retry_count ?? 0}/{scan.max_retries ?? 3}
                    </td>
                    <td className="py-2.5">
                      {scanStalled ? (
                        <span className="text-rose-400 font-semibold" title={`No heartbeat for ${heartbeatAge}s`}>
                          ⚠ Stalled ({heartbeatAge}s inactive)
                        </span>
                      ) : isQueued && !worker?.ok ? (
                        <span className="text-amber-300" title="Worker is offline">
                          ⏸ Waiting (Worker Offline)
                        </span>
                      ) : (
                        <span className="text-muted-dim">
                          {scan.stage ? `Stage: ${scan.stage}` : isFailed ? (scan.error ?? "failed") : "queued"}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-muted-dim">
                      {new Date(scan.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 text-right">
                      {isQueued || isRunning ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void cancelIndividualScan(scan.id)}
                          className="rounded border border-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/10"
                        >
                          Cancel
                        </button>
                      ) : isFailed && (scan.retry_count ?? 0) < (scan.max_retries ?? 3) ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void retryIndividualScan(scan.id)}
                          className="rounded border border-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/10"
                        >
                          Retry
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
