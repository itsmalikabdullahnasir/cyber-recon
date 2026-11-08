"use client";

type ScanHistory = Record<string, unknown> & {
  id: string; input: string; status: string; mode: string; stage?: string | null;
  error?: string | null; stages?: Record<string, { status?: string; at?: string; [key: string]: unknown }>;
  logs?: Array<{ level?: string; stage?: string; message?: string; created_at?: string }>;
  retry_count?: number; max_retries?: number; priority?: number;
  worker_heartbeat_at?: string | null; duration_seconds?: number | null;
  hosts_discovered?: number; findings_created?: number; findings_updated?: number; findings_resolved?: number;
};

function downloadReport(scan: ScanHistory) {
  const body = JSON.stringify(scan, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `scan-${scan.id}-report.json`; anchor.click(); URL.revokeObjectURL(url);
}

export function ScanHistoryClient({ scan }: { scan: Record<string, unknown> }) {
  const value = scan as ScanHistory;
  const stages = Object.entries(value.stages ?? {});
  const logs = value.logs ?? [];
  return <section className="flex flex-col gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Scan history</p><h1 className="mt-1 text-xl font-bold">{value.input}</h1><p className="mt-1 text-xs text-muted">{value.mode} · {value.status} · {value.stage ?? "waiting"}</p></div><button type="button" onClick={() => downloadReport(value)} className="rounded-md border border-accent/20 px-3 py-2 text-xs text-accent">Download report</button></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[
      ["Hosts", value.hosts_discovered], ["Created", value.findings_created], ["Updated", value.findings_updated], ["Resolved", value.findings_resolved], ["Retries", `${value.retry_count ?? 0}/${value.max_retries ?? 3}`],
    ].map(([label, item]) => <div key={label} className="rounded-xl border border-white/5 bg-surface p-3"><p className="text-[10px] uppercase tracking-widest text-muted-dim">{label}</p><p className="mt-1 text-lg font-bold">{item ?? 0}</p></div>)}</div>
    <div className="rounded-xl border border-white/5 bg-surface p-4"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-sm font-semibold">Stage timeline</h2><span className="text-xs text-muted-dim">Heartbeat: {value.worker_heartbeat_at ? new Date(value.worker_heartbeat_at).toLocaleString() : "not recorded"}</span></div><div className="mt-3 space-y-2">{stages.length ? stages.map(([name, stage]) => <div key={name} className="flex items-center justify-between border-t border-white/5 py-2 text-xs"><span>{name}</span><span className={stage.status === "done" ? "text-emerald-300" : stage.status === "failed" ? "text-rose-300" : "text-muted"}>{stage.status ?? "unknown"} · {stage.at ? new Date(stage.at).toLocaleString() : "—"}</span></div>) : <p className="text-xs text-muted-dim">No stage telemetry recorded.</p>}</div></div>
    <div className="rounded-xl border border-white/5 bg-surface p-4"><h2 className="text-sm font-semibold">Scan logs</h2><div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{logs.length ? logs.map((log, index) => <div key={`${log.created_at}-${index}`} className="border-t border-white/5 py-2 text-xs"><span className={log.level === "error" ? "text-rose-300" : log.level === "warning" ? "text-amber-300" : "text-muted-dim"}>{log.level ?? "info"}</span><span className="ml-2">{log.message}</span><span className="ml-2 text-muted-dim">{log.created_at ? new Date(log.created_at).toLocaleString() : ""}</span></div>) : <p className="text-xs text-muted-dim">No logs recorded.</p>}</div></div>
    {value.error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-300">Error: {value.error}</div>}
  </section>;
}
