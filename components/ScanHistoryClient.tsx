"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ScanLog = {
  id?: string;
  level?: "info" | "warning" | "error";
  stage?: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type StageInfo = {
  status?: string;
  at?: string;
  duration?: number;
  [key: string]: unknown;
};

type ScanHistory = {
  id: string;
  target_id: string;
  input: string;
  status: string;
  mode: string;
  stage?: string | null;
  error?: string | null;
  stages?: Record<string, StageInfo>;
  logs?: ScanLog[];
  retry_count?: number;
  max_retries?: number;
  priority?: number;
  worker_heartbeat_at?: string | null;
  duration_seconds?: number | null;
  hosts_discovered?: number;
  findings_created?: number;
  findings_updated?: number;
  findings_resolved?: number;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
};

function downloadReport(scan: ScanHistory, format: "json" | "csv") {
  if (format === "json") {
    const body = JSON.stringify(scan, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `scan-${scan.id}-report.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  // Format as CSV
  const rows = [
    ["Field", "Value"],
    ["Scan ID", scan.id],
    ["Target Input", scan.input],
    ["Mode", scan.mode],
    ["Status", scan.status],
    ["Stage", scan.stage ?? ""],
    ["Created At", scan.created_at],
    ["Started At", scan.started_at ?? ""],
    ["Finished At", scan.finished_at ?? ""],
    ["Duration Seconds", String(scan.duration_seconds ?? "")],
    ["Hosts Discovered", String(scan.hosts_discovered ?? 0)],
    ["Findings Created", String(scan.findings_created ?? 0)],
    ["Findings Updated", String(scan.findings_updated ?? 0)],
    ["Retries", `${scan.retry_count ?? 0} / ${scan.max_retries ?? 3}`],
    ["Error", scan.error ?? ""],
  ];

  const csvContent = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csvContent], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `scan-${scan.id}-summary.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ScanHistoryClient({ scan: initialScan }: { scan: Record<string, unknown> }) {
  const [scan, setScan] = useState<ScanHistory>(initialScan as unknown as ScanHistory);
  const [logs, setLogs] = useState<ScanLog[]>(((initialScan.logs as ScanLog[]) ?? []));
  const [now, setNow] = useState(() => Date.now());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Clock tick for heartbeat timing
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Supabase Realtime subscription for live log streaming and scan status updates
  useEffect(() => {
    const supabase = createClient();

    // 1. Listen for new logs
    const logChannel = supabase
      .channel(`scan_logs_${scan.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scan_logs",
          filter: `scan_id=eq.${scan.id}`,
        },
        (payload) => {
          const newLog = payload.new as ScanLog;
          setLogs((prev) => [newLog, ...prev]);
        }
      )
      .subscribe();

    // 2. Listen for scan status / stage updates
    const scanChannel = supabase
      .channel(`scan_row_${scan.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "scans",
          filter: `id=eq.${scan.id}`,
        },
        (payload) => {
          const updated = payload.new as Partial<ScanHistory>;
          setScan((prev) => ({ ...prev, ...updated }));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(logChannel);
      void supabase.removeChannel(scanChannel);
    };
  }, [scan.id]);

  const heartbeatAge = useMemo(() => {
    if (!scan.worker_heartbeat_at || scan.status !== "running") return null;
    return Math.max(0, Math.round((now - new Date(scan.worker_heartbeat_at).getTime()) / 1000));
  }, [scan.worker_heartbeat_at, scan.status, now]);

  const isStalled = heartbeatAge !== null && heartbeatAge > 90;

  const cancelThisScan = async () => {
    setActionBusy(true);
    setActionMessage(null);
    const { error } = await createClient().rpc("cancel_scan", { p_scan_id: scan.id });
    if (error) setActionMessage(`Cancel failed: ${error.message}`);
    else {
      setActionMessage("Scan cancelled successfully.");
      setScan((prev) => ({ ...prev, status: "failed", error: "cancelled by user" }));
    }
    setActionBusy(false);
  };

  const retryThisScan = async () => {
    setActionBusy(true);
    setActionMessage(null);
    const { error } = await createClient().rpc("retry_scan", { p_scan_id: scan.id });
    if (error) setActionMessage(`Retry failed: ${error.message}`);
    else {
      setActionMessage("Scan re-queued for execution.");
      setScan((prev) => ({
        ...prev,
        status: "queued",
        error: null,
        retry_count: (prev.retry_count ?? 0) + 1,
      }));
    }
    setActionBusy(false);
  };

  const stages = Object.entries(scan.stages ?? {});

  return (
    <section className="flex flex-col gap-6">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                scan.status === "running"
                  ? "bg-amber-400 animate-pulse"
                  : scan.status === "done"
                    ? "bg-emerald-400"
                    : scan.status === "failed"
                      ? "bg-rose-400"
                      : "bg-blue-400"
              }`}
            />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
              Scan Execution Details
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{scan.input}</h1>
          <p className="mt-1 text-xs text-muted">
            Mode: <strong className="text-foreground capitalize">{scan.mode}</strong> · Status:{" "}
            <strong className="text-foreground capitalize">{scan.status}</strong> · Stage:{" "}
            <span className="font-mono text-accent">{scan.stage ?? "waiting"}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {scan.status === "running" || scan.status === "queued" ? (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void cancelThisScan()}
              className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
            >
              Cancel Scan
            </button>
          ) : null}

          {scan.status === "failed" && (scan.retry_count ?? 0) < (scan.max_retries ?? 3) ? (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void retryThisScan()}
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-40"
            >
              Retry Scan ({scan.retry_count ?? 0}/{scan.max_retries ?? 3})
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => downloadReport(scan, "json")}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted hover:text-foreground"
          >
            Download JSON
          </button>
          <button
            type="button"
            onClick={() => downloadReport(scan, "csv")}
            className="rounded-md border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs text-accent hover:bg-accent/15"
          >
            Download CSV Report
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-xs text-muted-dim">
          {actionMessage}
        </div>
      )}

      {/* Heartbeat Warning Alert */}
      {isStalled && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">
          <p className="font-bold uppercase tracking-wider text-rose-300">
            ⚠ Worker Heartbeat Timeout Detected ({heartbeatAge}s ago)
          </p>
          <p className="mt-1">
            The worker executing this scan has not reported a heartbeat for over 90 seconds. The VM worker process
            may have encountered an Out-Of-Memory (OOM) kill or reboot. You can cancel and retry this scan using the controls above.
          </p>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="rounded-xl border border-white/5 bg-surface p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-dim">Hosts Found</p>
          <p className="mt-1 text-xl font-bold">{scan.hosts_discovered ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-surface p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-dim">Findings Created</p>
          <p className="mt-1 text-xl font-bold text-rose-300">{scan.findings_created ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-surface p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-dim">Findings Updated</p>
          <p className="mt-1 text-xl font-bold text-amber-300">{scan.findings_updated ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-surface p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-dim">Resolved</p>
          <p className="mt-1 text-xl font-bold text-emerald-300">{scan.findings_resolved ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-surface p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-dim">Duration</p>
          <p className="mt-1 text-xl font-bold">
            {scan.duration_seconds ? `${scan.duration_seconds}s` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-surface p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-dim">Retries</p>
          <p className="mt-1 text-xl font-bold">
            {scan.retry_count ?? 0} / {scan.max_retries ?? 3}
          </p>
        </div>
      </div>

      {/* Per-Stage Progress and Timeline */}
      <div className="rounded-xl border border-white/5 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div>
            <h2 className="text-sm font-semibold">Stage Execution &amp; Duration Timeline</h2>
            <p className="text-[11px] text-muted-dim">Telemetry captured per tool module execution</p>
          </div>
          <span className="text-xs text-muted-dim">
            Heartbeat:{" "}
            {scan.worker_heartbeat_at
              ? `${new Date(scan.worker_heartbeat_at).toLocaleTimeString()} (${heartbeatAge ?? 0}s ago)`
              : "not recorded"}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {stages.length ? (
            stages.map(([name, stage]) => {
              const isDone = stage.status === "done";
              const isFailed = stage.status === "failed";
              const isRunning = stage.status === "running";
              return (
                <div
                  key={name}
                  className="flex flex-wrap items-center justify-between rounded-lg border border-white/5 bg-background/30 p-2.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isDone
                          ? "bg-emerald-400"
                          : isFailed
                            ? "bg-rose-400"
                            : isRunning
                              ? "bg-amber-400 animate-pulse"
                              : "bg-white/20"
                      }`}
                    />
                    <span className="font-mono font-medium capitalize">{name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-dim">
                    <span
                      className={`font-semibold capitalize ${
                        isDone
                          ? "text-emerald-300"
                          : isFailed
                            ? "text-rose-300"
                            : isRunning
                              ? "text-amber-300"
                              : "text-muted"
                      }`}
                    >
                      {stage.status ?? "unknown"}
                    </span>
                    <span>{stage.at ? new Date(stage.at).toLocaleTimeString() : "—"}</span>
                    {stage.duration !== undefined && <span>{stage.duration}s</span>}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-muted-dim">No stage telemetry recorded yet.</p>
          )}
        </div>
      </div>

      {/* Live Log Streaming Section */}
      <div className="rounded-xl border border-white/5 bg-surface p-5">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-sm font-semibold">Live Worker Log Stream</h2>
            </div>
            <p className="text-[11px] text-muted-dim">
              Real-time audit log stream from the scanning engine
            </p>
          </div>
          <span className="font-mono text-[11px] text-muted-dim">{logs.length} entries</span>
        </div>

        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto font-mono text-xs">
          {logs.length ? (
            logs.map((log, index) => (
              <div
                key={log.id ?? `${log.created_at}-${index}`}
                className="flex items-start gap-3 rounded border border-white/[0.03] bg-background/40 p-2 leading-relaxed"
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider ${
                    log.level === "error"
                      ? "bg-rose-500/20 text-rose-300"
                      : log.level === "warning"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-white/10 text-muted"
                  }`}
                >
                  {log.level ?? "info"}
                </span>
                {log.stage && (
                  <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] font-semibold text-accent">
                    [{log.stage}]
                  </span>
                )}
                <span className="flex-1 break-all text-foreground">{log.message}</span>
                <span className="text-[10px] text-muted-dim shrink-0">
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-dim">No log records streamed yet.</p>
          )}
        </div>
      </div>

      {scan.error && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 text-xs text-rose-300">
          <p className="font-bold">Error Details:</p>
          <p className="mt-1 font-mono">{scan.error}</p>
        </div>
      )}
    </section>
  );
}
