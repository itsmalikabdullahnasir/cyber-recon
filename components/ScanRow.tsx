"use client";

import { useEffect, useId, useState } from "react";
import type { Scan, Host, Subdomain, Finding, Target } from "@/lib/types";
import { COMMON_PORTS } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/UserAvatar";
import { Modal } from "@/components/Modal";
import { scanRiskScore, riskTier } from "@/lib/risk";

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

export function ScanRow({
  scan,
  assignTargets = [],
  scanHosts,
  scanFindings,
}: {
  scan: Scan;
  assignTargets?: Pick<Target, "id" | "name">[];
  // Optional: this scan's already-loaded hosts/findings (passed from the
  // dashboard), used to show a per-scan risk tile without an extra query.
  scanHosts?: Host[];
  scanFindings?: Finding[];
}) {
  const [busy, setBusy] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [details, setDetails] = useState<ScanDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState(false);

  async function assignToGroup(targetId: string) {
    if (!targetId || targetId === scan.target_id) return;
    setAssigning(true);
    try {
      const supabase = createClient();
      const updates = await Promise.all([
        supabase.from("scans").update({ target_id: targetId }).eq("id", scan.id),
        supabase.from("hosts").update({ target_id: targetId }).eq("scan_id", scan.id),
        supabase.from("subdomains").update({ target_id: targetId }).eq("scan_id", scan.id),
        supabase.from("findings").update({ target_id: targetId }).eq("scan_id", scan.id),
      ]);
      const error = updates.find((result) => result.error)?.error;
      if (error) throw new Error(error.message);
      setAssigned(true);
    } catch (e) {
      alert(`Could not assign scan to group: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setAssigning(false);
    }
  }

  // Lazily pull this scan's actual results (hosts/subdomains/findings) the first
  // time any stage is opened, so the detail card can show real data.
  useEffect(() => {
    if (!openStage || details) return;
    let cancelled = false;
    setLoadingDetails(true);
    const supabase = createClient();
    Promise.all([
      supabase.from("hosts").select("*").eq("scan_id", scan.id),
      supabase.from("subdomains").select("*").eq("scan_id", scan.id),
      supabase.from("findings").select("*").eq("scan_id", scan.id),
    ])
      .then(([h, s, f]) => {
        if (cancelled) return;
        setDetails({
          hosts: (h.data as Host[]) ?? [],
          subs: (s.data as Subdomain[]) ?? [],
          finds: (f.data as Finding[]) ?? [],
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openStage, details, scan.id]);

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
  // Per-scan risk score (hosts + findings), shown only when the caller supplied
  // this scan's rows (dashboard does; console list doesn't).
  const risk = scanHosts && scanFindings ? scanRiskScore(scanHosts, scanFindings) : null;
  const riskT = risk !== null ? riskTier(risk) : null;

  return (
    <div
      onClick={() => setDetailOpen(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setDetailOpen(true);
        }
      }}
      className={`cursor-pointer rounded-xl border p-5 transition-colors hover:border-accent/30 ${running ? "border-amber-500/30 bg-amber-500/[0.04]" : "border-white/5 bg-surface"}`}
    >
      {detailOpen && <ScanDetailModal scan={scan} onClose={() => setDetailOpen(false)} />}
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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`rounded border px-2 py-1 text-[10px] font-semibold uppercase ${
            scan.mode === "full"
              ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
              : "border-indigo-500/20 bg-indigo-500/10 text-indigo-400"
          }`}
        >
          {scan.mode}
        </span>
        <span className="font-mono text-[15px] font-semibold">{scan.input}</span>
        <span
          className={`rounded px-2 py-1 text-[11px] font-semibold uppercase ${
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
        {riskT && (
          <span
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${riskT.tile}`}
            title={`Scan risk ${risk} / 100 (hosts + findings)`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${riskT.dot}`} />
            risk {risk}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {scan.requested_by_email && (
            <span className="flex items-center gap-1 text-[11px] text-muted-dim" title={`Scanned by ${scan.requested_by_email}`}>
              <UserAvatar name={scan.requested_by_email} size={16} />
              {scan.requested_by_email.split("@")[0]}
            </span>
          )}
          <span className="text-[11px] text-muted-dim">{new Date(scan.created_at).toLocaleString()}</span>
          {assignTargets.length > 0 && (
            <select
              defaultValue=""
              disabled={assigning}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { void assignToGroup(e.target.value); e.target.value = ""; }}
              className="rounded-md border border-white/10 bg-background px-1.5 py-1 text-[11px] outline-none focus:border-accent/40"
              title="Link this scan and its results to a group"
            >
              <option value="">{assigned ? "Assigned ✓" : "Link to group…"}</option>
              {assignTargets.filter((target) => target.id !== scan.target_id).map((target) => (
                <option key={target.id} value={target.id}>{target.name}</option>
              ))}
            </select>
          )}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
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
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
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
        <StageDetail
          name={openStage}
          stage={stages[openStage]}
          details={details}
          loading={loadingDetails}
          onClose={() => setOpenStage(null)}
        />
      )}
      {scan.error && (
        <p className={`mt-2 text-[11px] ${cancelled ? "text-muted-dim" : "text-danger"}`}>{scan.error}</p>
      )}

      <div className="mt-2 flex items-center gap-2">
        {(scan.status === "running" || scan.status === "queued") && (
          <button
            onClick={(e) => { e.stopPropagation(); void stop(); }}
            disabled={busy}
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
            title="Stop this scan. A running scan stops at its next stage; the record is kept."
          >
            {busy ? "…" : "■ Stop"}
          </button>
        )}
        {(scan.status === "failed" || scan.status === "done") && (
          <button
            onClick={(e) => { e.stopPropagation(); void rerun(); }}
            disabled={busy}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
            title={scan.status === "done" ? "Run this scan again" : "Re-queue and resume this scan"}
          >
            {busy ? "…" : scan.status === "done" ? "↻ Re-scan" : "↻ Resume"}
          </button>
        )}
        {duration && <span className="ml-auto text-[11px] text-muted-dim">⏱ {duration}</span>}
      </div>
    </div>
  );
}

// Full scan detail popup — opens when a scan card is clicked. Reuses the shared
// <Modal> shell (same one as the host-detail card). Shows the complete stage
// breakdown (untruncated), pipeline config, result counts and run metadata, and
// stays live for running scans via a Realtime subscription on the scans row.
function ScanDetailModal({ scan: initial, onClose }: { scan: Scan; onClose: () => void }) {
  const baseId = useId();
  const [scan, setScan] = useState<Scan>(initial);
  const [details, setDetails] = useState<ScanDetails | null>(null);
  // Single-open accordion: only one stage panel is expanded at a time.
  const [openStage, setOpenStage] = useState<string | null>(null);

  // Keep the modal live: running scans push new stages as they complete.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`scan-detail-${initial.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scans", filter: `id=eq.${initial.id}` },
        (payload) => setScan((prev) => ({ ...prev, ...(payload.new as Scan) })),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initial.id]);

  // Load this scan's real results once (and again when it finishes) so the count
  // tiles AND every expandable stage panel read from the same in-memory data —
  // no extra round-trip per stage opened.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.from("hosts").select("*").eq("scan_id", initial.id),
      supabase.from("subdomains").select("*").eq("scan_id", initial.id),
      supabase.from("findings").select("*").eq("scan_id", initial.id),
    ]).then(([h, s, f]) => {
      if (cancelled) return;
      setDetails({
        hosts: (h.data as Host[]) ?? [],
        subs: (s.data as Subdomain[]) ?? [],
        finds: (f.data as Finding[]) ?? [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [initial.id, scan.status]);

  const stages = scan.stages || {};
  const duration = scanDuration(scan);
  const cancelled = scan.status === "failed" && /cancel|stopped/i.test(scan.error ?? "");
  const displayStatus = cancelled ? "stopped" : scan.status;
  const pipeline = Array.isArray(scan.pipeline) ? scan.pipeline : null;
  const orderedKeys = STAGE_ORDER.filter((k) => stages[k]);
  const extraKeys = Object.keys(stages).filter((k) => !STAGE_ORDER.includes(k));
  const allKeys = [...orderedKeys, ...extraKeys];
  const risk = details ? scanRiskScore(details.hosts, details.finds) : null;
  const riskT = risk !== null ? riskTier(risk) : null;

  return (
    <Modal onClose={onClose} ariaLabel={`Scan detail for ${scan.input}`}>
      {/* header */}
      <div className="relative overflow-hidden border-b border-white/5 p-5">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">Scan detail</p>
            <h3 className="mt-1 truncate font-mono text-xl font-bold text-foreground">{scan.input}</h3>
            <p className="mt-0.5 text-xs text-muted-dim">
              <span className="uppercase">{scan.mode}</span> · {displayStatus}
              {duration ? ` · ⏱ ${duration}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-dim">
              {scan.requested_by_email && (
                <span className="flex items-center gap-1">
                  <UserAvatar name={scan.requested_by_email} size={16} />
                  {scan.requested_by_email.split("@")[0]}
                </span>
              )}
              <span>{new Date(scan.created_at).toLocaleString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {riskT && (
              <span
                className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl text-sm font-bold ${riskT.tile}`}
                title={`Scan risk ${risk} / 100 (hosts + findings)`}
              >
                {risk}
                <span className="text-[8px] font-medium uppercase opacity-70">risk</span>
              </span>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
        {details && (
          <div className="grid grid-cols-3 gap-2">
            <StatMini label="Hosts" value={details.hosts.length} />
            <StatMini label="Subdomains" value={details.subs.length} />
            <StatMini label="Findings" value={details.finds.length} />
          </div>
        )}

        {pipeline && (
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
              Pipeline ({pipeline.filter((m) => m.enabled).length}/{pipeline.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pipeline.map((m) => (
                <span
                  key={m.id}
                  className={`rounded border px-2 py-1 text-[11px] ${
                    m.enabled
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : "border-white/10 text-muted-dim line-through"
                  }`}
                >
                  {STAGE_LABELS[m.id] ?? m.id}
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
            Stages ({allKeys.length})
          </p>
          {allKeys.length === 0 ? (
            <p className="text-xs text-muted-dim">No stage progress recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {allKeys.map((k) => {
                const st = stages[k] as Record<string, unknown>;
                const status = String(st.status ?? "");
                const at = typeof st.at === "string" ? new Date(st.at).toLocaleTimeString() : null;
                const meta = Object.entries(st).filter(([mk]) => mk !== "status" && mk !== "at");
                const count = stageCount(st);
                const expanded = openStage === k;
                const panelId = `${baseId}-stage-${k}`;
                return (
                  <div key={k} className="overflow-hidden rounded-lg border border-white/5 bg-background/40">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => setOpenStage(expanded ? null : k)}
                      className="flex w-full items-center gap-2 p-2.5 text-left text-xs transition-colors hover:bg-white/[0.04]"
                    >
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-zinc-600"}`} />
                      <span className="font-medium">{STAGE_LABELS[k] ?? k}</span>
                      <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-dim">
                        {status}
                      </span>
                      {count !== undefined && <span className="text-[10px] text-muted-dim">{count}</span>}
                      <span className="ml-auto flex items-center gap-2">
                        {at && <span className="text-[10px] text-muted-dim">{at}</span>}
                        <svg
                          className={`h-3.5 w-3.5 shrink-0 text-muted-dim transition-transform ${expanded ? "rotate-180" : ""}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>
                    {expanded && (
                      <div id={panelId} role="region" className="border-t border-white/5 p-2.5 text-xs">
                        {meta.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-0.5 border-b border-white/5 pb-2">
                            {meta.map(([mk, v]) => (
                              <span key={mk} className="text-[10px] text-muted-dim">
                                {mk.replace(/_/g, " ")}: <span className="text-foreground">{formatStageValue(v)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {details ? (
                          <StageResults name={k} data={details} />
                        ) : (
                          <p className="text-muted-dim">Loading results…</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {scan.error && (
          <p className={`text-[11px] ${cancelled ? "text-muted-dim" : "text-danger"}`}>{scan.error}</p>
        )}
      </div>
    </Modal>
  );
}

function StatMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-background/40 px-3 py-2">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-dim">{label}</p>
    </div>
  );
}

type ScanDetails = { hosts: Host[]; subs: Subdomain[]; finds: Finding[] };

const SEV_COLOR: Record<string, string> = {
  Critical: "#f43f5e",
  High: "#ec4899",
  Medium: "#f59e0b",
  Low: "#a855f7",
  Info: "#5c5775",
};

// Which finding `source` values belong to which module/stage.
const STAGE_FINDING_SOURCES: Record<string, string[]> = {
  cve: ["cve-local"],
  origin: ["origin"],
  testssl: ["testssl"],
  dirs: ["feroxbuster"],
  nuclei: ["nuclei"],
  nikto: ["nikto"],
};

// Detail card shown when a stage chip is clicked: the stage's progress meta
// plus the real results this scan produced for that module.
function StageDetail({
  name,
  stage,
  details,
  loading,
  onClose,
}: {
  name: string;
  stage: Record<string, unknown>;
  details: ScanDetails | null;
  loading: boolean;
  onClose: () => void;
}) {
  const label = STAGE_LABELS[name] ?? name;
  const status = String(stage.status ?? "");
  const at = typeof stage.at === "string" ? new Date(stage.at).toLocaleString() : null;
  const meta = Object.entries(stage).filter(([k]) => k !== "status" && k !== "at");

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2 rounded-lg border border-accent/20 bg-accent/[0.04] p-3 text-[11px]"
    >
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
      {at && <p className="mb-1.5 text-[10px] text-muted-dim">updated {at}</p>}

      {meta.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-0.5 border-b border-white/5 pb-2">
          {meta.map(([k, v]) => (
            <span key={k} className="text-[10px] text-muted-dim">
              {k.replace(/_/g, " ")}: <span className="text-foreground">{formatStageValue(v)}</span>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-muted-dim">Loading results…</p>
      ) : details ? (
        <StageResults name={name} data={details} />
      ) : (
        <p className="text-muted-dim">No results loaded.</p>
      )}
    </div>
  );
}

function StageEmpty({ text }: { text: string }) {
  return <p className="text-muted-dim">{text}</p>;
}

function StageResults({ name, data }: { name: string; data: ScanDetails }) {
  // Port scan — ports plus what each one is for (443 → HTTPS, etc.).
  if (name === "nmap") {
    const hosts = data.hosts.filter((h) => (h.ports?.length ?? 0) > 0 || h.open_ports);
    if (!hosts.length) return <StageEmpty text="No open ports recorded." />;
    return (
      <div className="flex flex-col gap-2">
        {hosts.map((h) => (
          <div key={h.id}>
            <p className="font-mono text-[11px] font-semibold">
              {h.ip}
              {h.hostname ? ` (${h.hostname})` : ""}
              {h.os_guess ? ` · ${h.os_guess}` : ""}
            </p>
            <div className="mt-0.5 flex flex-col gap-0.5">
              {(h.ports?.length ?? 0) > 0 ? (
                (h.ports ?? []).map((p, i) => (
                  <div key={i} className="flex gap-2 text-[10px]">
                    <span className="w-16 shrink-0 font-mono text-accent">
                      {p.port}/{p.protocol}
                    </span>
                    <span className="w-24 shrink-0 text-muted">{COMMON_PORTS[p.port] ?? p.service ?? "?"}</span>
                    <span className="min-w-0 flex-1 text-muted-dim">
                      {[p.product, p.version].filter(Boolean).join(" ") || p.service || ""}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-[10px] text-muted-dim">{h.open_ports}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (name === "subfinder" || name === "dnsx") {
    if (!data.subs.length) return <StageEmpty text="No subdomains recorded." />;
    return (
      <div className="flex flex-col gap-0.5">
        {data.subs.slice(0, 80).map((s) => (
          <div key={s.id} className="flex gap-2 text-[10px]">
            <span className="min-w-0 flex-1 truncate font-mono">{s.name}</span>
            <span className="shrink-0 text-muted-dim">{s.ip ?? s.resolved_ips?.join(", ") ?? "—"}</span>
            {s.is_cdn && <span className="shrink-0 text-amber-400">CDN</span>}
          </div>
        ))}
      </div>
    );
  }

  if (name === "httpx" || name === "fingerprint") {
    const withHttp = data.subs.filter((s) => s.http_status || s.url);
    const list = withHttp.length ? withHttp : data.subs;
    if (!list.length) return <StageEmpty text="No HTTP data recorded." />;
    return (
      <div className="flex flex-col gap-1">
        {list.slice(0, 60).map((s) => {
          const host = data.hosts.find((h) => h.ip === s.ip);
          const line = [
            s.webserver ? `server: ${s.webserver}` : "",
            s.tech?.length ? s.tech.join(", ") : "",
            name === "fingerprint" && host?.waf ? `WAF: ${host.waf}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={s.id} className="text-[10px]">
              <div className="flex gap-2">
                <span className="min-w-0 flex-1 truncate font-mono">{s.url ?? s.name}</span>
                {s.http_status ? <span className="shrink-0 text-accent">{s.http_status}</span> : null}
              </div>
              {line && <p className="text-muted-dim">{line}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  const sources = STAGE_FINDING_SOURCES[name];
  if (sources) {
    const items = data.finds.filter((f) => sources.includes(f.source ?? ""));
    if (!items.length) return <StageEmpty text="No findings from this module." />;
    return (
      <div className="flex flex-col gap-1.5">
        {items.slice(0, 60).map((f) => (
          <div key={f.id} className="border-l-2 pl-2" style={{ borderColor: SEV_COLOR[f.severity] ?? "#5c5775" }}>
            <div className="flex gap-2 text-[10px]">
              <span className="shrink-0 font-semibold" style={{ color: SEV_COLOR[f.severity] }}>
                {f.severity}
              </span>
              <span className="min-w-0 flex-1">{f.title}</span>
            </div>
            {f.affected_url && <p className="break-all font-mono text-[9px] text-muted-dim">{f.affected_url}</p>}
            {f.cve_id && (
              <span className="text-[9px] text-accent">
                {f.cve_id}
                {typeof f.cvss === "number" ? ` · CVSS ${f.cvss}` : ""}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return <StageEmpty text="No per-item results for this module." />;
}

function formatStageValue(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(", ") : "none";
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
