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
  return (
    <div className="rounded-xl border border-white/5 bg-surface p-3">
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
