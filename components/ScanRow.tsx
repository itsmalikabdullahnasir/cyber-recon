"use client";

import type { Scan } from "@/lib/types";

// Ordered pipeline stages, with short labels for the progress chips.
export const STAGE_ORDER = [
  "subfinder", "dnsx", "httpx", "fingerprint", "cve",
  "nmap", "testssl", "dirs", "nuclei", "nikto",
];

export const STAGE_LABELS: Record<string, string> = {
  subfinder: "Subdomains",
  dnsx: "DNS resolve",
  httpx: "HTTP probe",
  fingerprint: "Fingerprint",
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

export function ScanRow({ scan }: { scan: Scan }) {
  const stages = scan.stages || {};
  const running = scan.status === "running" || scan.status === "queued";
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
            scan.status === "done"
              ? "text-emerald-400"
              : scan.status === "failed"
                ? "text-rose-400"
                : "text-amber-400"
          }`}
        >
          {scan.status}
        </span>
        <span className="ml-auto text-[10px] text-muted-dim">{new Date(scan.created_at).toLocaleString()}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {STAGE_ORDER.map((key) => {
          const st = stages[key];
          if (!st) return null;
          const count = stageCount(st);
          return (
            <span
              key={key}
              title={typeof st.detail === "string" ? st.detail : st.status}
              className="flex items-center gap-1 rounded-md border border-white/5 bg-white/[0.02] px-1.5 py-0.5 text-[10px]"
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[st.status] ?? "bg-zinc-600"}`} />
              {STAGE_LABELS[key] ?? key}
              {count !== undefined && <span className="text-muted-dim">{count}</span>}
            </span>
          );
        })}
      </div>
      {scan.error && <p className="mt-2 text-[11px] text-danger">{scan.error}</p>}
    </div>
  );
}
