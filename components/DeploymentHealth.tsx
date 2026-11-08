"use client";

import { useState } from "react";

type Check = { name: string; ready: boolean };
type Health = {
  schema_version?: string;
  checked_at?: string;
  ready?: boolean;
  checks?: Check[];
  migration_checklist?: string[];
};
type Quality = {
  score?: number;
  total?: number;
  complete?: number;
  incomplete?: number;
  missing_fingerprint?: number;
  duplicates?: number;
  stale?: number;
  unassigned?: number;
};

const RPC_MIGRATION_MAP: Record<string, string> = {
  get_dashboard_data: "20261106000500_dashboard_data.sql",
  get_findings_groups: "20261108001500_repair_findings_groups_rpc.sql",
  get_findings_export: "20261108001400_findings_filtered_export.sql",
  get_scan_history: "20261108001300_scan_observability_permissions.sql",
  get_finding_comments: "20261108001700_finding_comments_host_history.sql",
  set_finding_sla: "20261108001700_finding_comments_host_history.sql",
  get_team_members: "20261108001700_finding_comments_host_history.sql",
  scan_logs: "20261108001300_scan_observability_permissions.sql",
  finding_comments: "20261108001700_finding_comments_host_history.sql",
  host_history: "20261108001700_finding_comments_host_history.sql",
  finding_fingerprint: "20261108001100_stable_finding_identity.sql",
  finding_sla: "20261108001700_finding_comments_host_history.sql",
  worker_heartbeat: "20261108001300_scan_observability_permissions.sql",
};

export function DeploymentHealth({
  health,
  quality,
}: {
  health: Health | null;
  quality: Quality | null;
}) {
  const [showChecklist, setShowChecklist] = useState(false);
  const [copied, setCopied] = useState(false);

  const ready = health?.ready === true;
  const score = quality?.score ?? 0;
  const checks = health?.checks ?? [];
  const failedChecks = checks.filter((c) => !c.ready);
  const checklist = health?.migration_checklist ?? [
    "20261108001300_scan_observability_permissions.sql",
    "20261108001400_findings_filtered_export.sql",
    "20261108001500_repair_findings_groups_rpc.sql",
    "20261108001600_health_quality_scan_history.sql",
    "20261108001700_finding_comments_host_history.sql",
  ];

  const copyMigrationCommand = () => {
    void navigator.clipboard.writeText("npx supabase db push");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {/* Database Health Card */}
      <div
        className={`rounded-xl border p-4.5 transition-all ${
          ready
            ? "border-emerald-500/25 bg-emerald-500/[0.03]"
            : "border-amber-500/30 bg-amber-500/[0.04]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  ready ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                }`}
              />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
                Database Health &amp; Schema
              </p>
            </div>
            <h3 className="mt-1 text-sm font-semibold">
              {ready ? "All Database RPCs & Tables Verified" : "Migration Attention Required"}
            </h3>
          </div>
          <span
            className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold ${
              ready
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            {health?.schema_version ? `v${health.schema_version}` : "vUnverified"}
          </span>
        </div>

        {/* RPC & Table Checklist Status Grid */}
        <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {checks.map((check) => (
            <div
              key={check.name}
              className={`rounded border p-2 transition-colors ${
                check.ready
                  ? "border-emerald-500/15 bg-background/30 text-foreground"
                  : "border-rose-500/30 bg-rose-500/5 text-rose-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={check.ready ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                  {check.ready ? "✓" : "✗"}
                </span>
                {!check.ready && (
                  <span className="text-[9px] uppercase tracking-wider text-rose-300">Missing</span>
                )}
              </div>
              <p className="mt-1 truncate font-mono text-[10px]" title={check.name}>
                {check.name}
              </p>
            </div>
          ))}
        </div>

        {/* Missing RPC Warnings */}
        {failedChecks.length > 0 && (
          <div className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/5 p-2.5 text-xs text-rose-300">
            <p className="font-semibold text-rose-200">Outdated or Missing Schema Components:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
              {failedChecks.map((f) => (
                <li key={f.name}>
                  <code className="font-semibold text-rose-100">{f.name}</code>: Apply{" "}
                  <span className="font-mono underline">
                    {RPC_MIGRATION_MAP[f.name] ?? "latest migration"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!health && (
          <p className="mt-3 text-xs text-amber-300">
            Apply migration <code className="font-mono">20261108001600</code> and{" "}
            <code className="font-mono">20261108001700</code> to enable database health diagnostics.
          </p>
        )}

        {/* Migration Checklist Expandable Section */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
          <button
            type="button"
            onClick={() => setShowChecklist(!showChecklist)}
            className="text-[11px] font-medium text-accent hover:underline"
          >
            {showChecklist ? "Hide Migration Checklist ▲" : "View Supabase Migration Checklist ▼"}
          </button>
          <button
            type="button"
            onClick={copyMigrationCommand}
            className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-muted hover:text-white"
          >
            {copied ? "Copied 'supabase db push'!" : "Copy Push Command"}
          </button>
        </div>

        {showChecklist && (
          <div className="mt-2.5 max-h-48 overflow-y-auto rounded-lg border border-white/5 bg-background/50 p-2.5 text-xs">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-dim">
              Sequential Migrations Checklist ({checklist.length})
            </p>
            <ol className="list-decimal space-y-1 pl-4 font-mono text-[11px] text-muted">
              {checklist.map((mig) => (
                <li key={mig} className="break-all hover:text-foreground">
                  {mig}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Finding Data Quality Card */}
      <div
        className={`rounded-xl border p-4.5 transition-all ${
          score >= 90
            ? "border-emerald-500/25 bg-emerald-500/[0.03]"
            : score >= 70
              ? "border-amber-500/30 bg-amber-500/[0.04]"
              : "border-rose-500/30 bg-rose-500/[0.04]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
              Finding Data Quality
            </p>
            <h3 className="mt-1 text-sm font-semibold">
              {score >= 90
                ? "High Integrity Finding Context"
                : score >= 70
                  ? "Moderate Integrity: Incomplete Attributes Found"
                  : "Low Integrity: Missing Target/Host/URL Context"}
            </h3>
          </div>
          <div className="text-right">
            <span
              className={`text-2xl font-bold ${
                score >= 90
                  ? "text-emerald-400"
                  : score >= 70
                    ? "text-amber-400"
                    : "text-rose-400"
              }`}
            >
              {score}%
            </span>
            <p className="text-[9px] uppercase tracking-wider text-muted-dim">Context Score</p>
          </div>
        </div>

        {/* Quality Metrics Grid */}
        <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-6">
          <Metric label="Total" value={quality?.total} />
          <Metric label="Complete" value={quality?.complete} />
          <Metric label="Incomplete" value={quality?.incomplete} alert={!!quality?.incomplete && quality.incomplete > 0} />
          <Metric label="Duplicates" value={quality?.duplicates} />
          <Metric label="Stale (&gt;30d)" value={quality?.stale} />
          <Metric label="Unassigned" value={quality?.unassigned} alert={!!quality?.unassigned && quality.unassigned > 0} />
        </div>

        {/* Unassigned / Incomplete warnings */}
        {(quality?.unassigned ?? 0) > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-300">
            <span>
              <strong>{quality?.unassigned} findings</strong> are currently unassigned to team analysts.
            </span>
            <a href="#workbench" className="text-[11px] underline hover:text-amber-200">
              Assign Now
            </a>
          </div>
        )}

        {(quality?.missing_fingerprint ?? 0) > 0 && (
          <p className="mt-2 text-xs text-rose-300">
            Notice: {quality?.missing_fingerprint} findings lack a stable fingerprint.
          </p>
        )}

        {!quality && (
          <p className="mt-3 text-xs text-amber-300">
            Data-quality RPC unavailable until the health migration is applied.
          </p>
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value?: number;
  alert?: boolean;
}) {
  return (
    <div className={`rounded border p-2 ${alert ? "border-amber-500/30 bg-amber-500/5 text-amber-200" : "border-white/5 bg-background/20"}`}>
      <p className="truncate text-[10px] uppercase tracking-widest text-muted-dim">{label}</p>
      <p className={`mt-1 font-semibold ${alert ? "text-amber-300" : "text-foreground"}`}>
        {(value ?? 0).toLocaleString()}
      </p>
    </div>
  );
}
