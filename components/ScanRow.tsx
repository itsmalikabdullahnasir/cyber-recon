"use client";

import { useState } from "react";
import type { Scan } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/UserAvatar";

// Ordered pipeline stages, with short labels for the progress chips.
export const STAGE_ORDER = [
  "subfinder", "dnsx", "httpx", "fingerprint", "origin", "cve",
  "nmap", "testssl", "dirs", "nuclei", "nikto",
];

export const STAGE_LABELS: Record<string, string> = {
  subfinder: "Subdomains",
  dnsx: "DNS resolve",
  httpx: "HTTP probe",
  fingerprint: "Fingerprint",
  origin: "Origin IP",
  cve: "CVE match",
  nmap: "Port scan",
  testssl: "TLS audit",
  dirs: "Dir brute",
  nuclei: "Vuln templates",
  nikto: "Nikto",
};

const STATUS_DOT: Record<string, string> = {
  done: "bg-emerald-400",
  running: "bg-amber-400 animate-pulse",
  refused: "bg-rose-400",
  skipped: "bg-zinc-500",
  failed: "bg-rose-500",
};

// Pull the most informative count out of a stage's payload for the chip.
function stageCount(st: Record<string, unknown>): number | undefined {
  for (const key of ["found", "findings", "count", "live", "scanned", "done"]) {
    if (typeof st[key] === "number") return st[key] as number;
  }
  return undefined;
}

// Human-readable elapsed time for a scan (recomputed on each render, so it
// refreshes whenever Realtime pushes a new stage for a running scan).
function scanDuration(scan: Scan): string | null {
  const start = scan.started_at ?? scan.created_at;
  const end = scan.finished_at ?? (scan.status === "running" ? new Date().toISOString() : null);
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function ScanRow({ scan }: { scan: Scan }) {
  const [busy, setBusy] = useState(false);
  const [openStage, setOpenStage] = useState<string | null>(null);

  async function updateScan(values: Record<string, unknown>, failMsg: string) {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("scans").update(values).eq("id", scan.id);
      if (error) alert(`${failMsg}: ${error.message}`);
    } catch (e) {
      alert(`${failMsg}: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  // Stop this one scan. The worker re-reads the row status at each stage
  // boundary and aborts the scan in progress; a queued row simply never gets
  // claimed. Either way the record is kept (status failed, "cancelled by user").
  const stop = () =>
    updateScan(
      { status: "failed", error: "cancelled by user", finished_at: new Date().toISOString() },
      "Could not stop the scan",
    );

  // Resume / re-run this exact scan: re-queue it and clear prior progress. The
  // worker's poller claims it again in order.
  const rerun = () =>
    updateScan(
      { status: "queued", error: null, stage: null, stages: {}, started_at: null, finished_at: null },
      "Could not re-queue the scan",
    );

  const stages = scan.stages || {};
  const running = scan.status === "running" || scan.status === "queued";
  // A user-cancelled scan is stored as failed with this error. Show it as its
  // own "stopped" state so the record reads clearly (not a real failure).
  const cancelled = scan.status === "failed" && /cancel|stopped/i.test(scan.error ?? "");
  const displayStatus = cancelled ? "stopped" : scan.status;
  const duration = scanDuration(scan);
  const stageKeys = STAGE_ORDER.filter((k) => stages[k]);
  const doneStages = stageKeys.filter((k) => ["done", "skipped", "refused"].includes(stages[k].status)).length;
  const currentLabel = scan.stage ? STAGE_LABELS[scan.stage] ?? scan.stage : null;

  return (
    <div className={`rounded-xl border p-3 transition-colors ${running ? "border-amber-500/30 bg-amber-500/[0.04]" : "border-white/5 bg-surface"}`}>
      {scan.status === "running" && currentLabel && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5">
          <svg className="h-3.5 w-3.5 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="text-[11px] font-medium text-amber-200">Now: {currentLabel}</span>
          {stageKeys.length > 0 && (
            <span className="ml-auto text-[10px] text-amber-300/70">stage {doneStages}/{stageKeys.length}</span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
            scan.mode === "full"
              ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
              : "border-indigo-500/20 bg-indigo-500/10 text-indigo-400"
          }`}
        >
          {scan.mode}
        </span>
        <span className="font-mono">{scan.input}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
            displayStatus === "done"
              ? "text-emerald-400"
              : displayStatus === "stopped"
                ? "text-zinc-400"
                : displayStatus === "failed"
                  ? "text-rose-400"
                  : "text-amber-400"
          }`}
        >
          {displayStatus}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {scan.requested_by_email && (
            <span className="flex items-center gap-1 text-[10px] text-muted-dim" title={`Scanned by ${scan.requested_by_email}`}>
              <UserAvatar name={scan.requested_by_email} size={16} />
              {scan.requested_by_email.split("@")[0]}
            </span>
          )}
          <span className="text-[10px] text-muted-dim">{new Date(scan.created_at).toLocaleString()}</span>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {STAGE_ORDER.map((key) => {
          const st = stages[key];
          if (!st) return null;
          const count = stageCount(st);
          const active = openStage === key;
          return (
            <button
              key={key}
              onClick={(e) => {
                e.stopPropagation();
                setOpenStage(active ? null : key);
              }}
              title="Click for stage details"
              className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
                active ? "border-accent/40 bg-accent/10" : "border-white/5 bg-white/[0.02] hover:border-white/15"
              }`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[st.status] ?? "bg-zinc-600"}`} />
              {STAGE_LABELS[key] ?? key}
              {count !== undefined && <span className="text-muted-dim">{count}</span>}
            </button>
          );
        })}
      </div>

      {openStage && stages[openStage] && (
        <StageDetail name={openStage} stage={stages[openStage]} onClose={() => setOpenStage(null)} />
      )}
      {scan.error && (
        <p className={`mt-2 text-[11px] ${cancelled ? "text-muted-dim" : "text-danger"}`}>{scan.error}</p>
      )}

      <div className="mt-2 flex items-center gap-2">
        {(scan.status === "running" || scan.status === "queued") && (
          <button
            onClick={stop}
            disabled={busy}
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
            title="Stop this scan. A running scan stops at its next stage; the record is kept."
          >
            {busy ? "…" : "■ Stop"}
          </button>
        )}
        {(scan.status === "failed" || scan.status === "done") && (
          <button
            onClick={rerun}
            disabled={busy}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
            title={scan.status === "done" ? "Run this scan again" : "Re-queue and resume this scan"}
          >
            {busy ? "…" : scan.status === "done" ? "↻ Re-scan" : "↻ Resume"}
          </button>
        )}
        {duration && <span className="ml-auto text-[10px] text-muted-dim">⏱ {duration}</span>}
      </div>
    </div>
  );
}

// Detail card shown when a stage chip is clicked — lists everything the worker
// recorded for that stage (counts, skips, errors, detail text).
function StageDetail({
  name,
  stage,
  onClose,
}: {
  name: string;
  stage: Record<string, unknown>;
  onClose: () => void;
}) {
  const label = STAGE_LABELS[name] ?? name;
  const status = String(stage.status ?? "");
  const at = typeof stage.at === "string" ? new Date(stage.at).toLocaleString() : null;
  const entries = Object.entries(stage).filter(([k]) => k !== "status" && k !== "at");

  return (
    <div className="mt-2 rounded-lg border border-accent/20 bg-accent/[0.04] p-3 text-[11px]">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-zinc-600"}`} />
          {label}
          <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-dim">
            {status}
          </span>
        </span>
        <button onClick={onClose} className="text-muted-dim hover:text-foreground" title="Close">
          ✕
        </button>
      </div>
      {at && <p className="mb-1 text-[10px] text-muted-dim">updated {at}</p>}
      {entries.length === 0 ? (
        <p className="text-muted-dim">No extra details recorded for this stage.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="w-28 shrink-0 text-muted-dim">{k.replace(/_/g, " ")}</span>
              <span className="min-w-0 flex-1 break-words">{formatStageValue(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatStageValue(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(", ") : "none";
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
