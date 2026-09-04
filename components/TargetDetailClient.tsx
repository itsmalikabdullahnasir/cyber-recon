"use client";

import { useState } from "react";
import type { Target, Host, Finding } from "@/lib/types";
import {
  STATUS_COLORS,
  CATEGORY_ICONS,
  LIKELIHOOD_ORDER,
  SEVERITY_ORDER,
} from "@/lib/types";
import { LikelihoodBadge } from "@/components/LikelihoodBadge";
import { HostsTab } from "@/components/HostsTab";
import { FindingsTab } from "@/components/FindingsTab";
import { NotesTab } from "@/components/NotesTab";

type Tab = "hosts" | "findings" | "notes" | "overview";

export function TargetDetailClient({
  target,
  hosts,
  findings,
}: {
  target: Target;
  hosts: Host[];
  findings: Finding[];
}) {
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { id: Tab; label: string; icon: string; count?: number }[] = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "hosts", label: "Hosts", icon: "🖥️", count: hosts.length },
    {
      id: "findings",
      label: "Findings",
      icon: "🐛",
      count: findings.length,
    },
    { id: "notes", label: "Notes", icon: "📝" },
  ];

  const critCount = findings.filter((f) => f.severity === "Critical").length;
  const highCount = findings.filter((f) => f.severity === "High").length;
  const liveHosts = hosts.filter((h) => h.status === "Live").length;

  const workflowStages = [
    "Not Started",
    "Recon",
    "Scanning",
    "Enumeration",
    "Exploitation",
    "Post-Exploitation",
    "Reporting",
    "Done",
  ];
  const currentStageIdx = workflowStages.indexOf(target.status);

  return (
    <div className="flex flex-col gap-6">
      {/* Target header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl">
            {CATEGORY_ICONS[target.category] ?? "📁"}
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {target.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {target.domain && <span>{target.domain}</span>}
              {target.ip_range && (
                <span className="font-mono">{target.ip_range}</span>
              )}
              {target.owner && <span>Owner: {target.owner}</span>}
              {target.methodology && (
                <span className="rounded bg-white/5 px-1.5 py-0.5">
                  {target.methodology}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              STATUS_COLORS[target.status] ?? "bg-white/5 text-muted"
            }`}
          >
            {target.status}
          </span>
          {target.scope === "Out of Scope" && (
            <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
              ⚠ Out of scope
            </span>
          )}
          {target.priority !== "None" && (
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                target.priority === "Critical"
                  ? "bg-red-500/15 text-red-400"
                  : target.priority === "High"
                  ? "bg-orange-500/15 text-orange-400"
                  : target.priority === "Medium"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-teal-500/15 text-teal-400"
              }`}
            >
              {target.priority} priority
            </span>
          )}
        </div>

        {/* Workflow progress */}
        <div className="rounded-xl border border-white/6 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">
              Pentest workflow
            </span>
            <span className="text-[10px] text-muted-dim">
              Stage {currentStageIdx + 1}/{workflowStages.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {workflowStages.map((stage, i) => {
              const isPast = i < currentStageIdx;
              const isCurrent = i === currentStageIdx;
              return (
                <div key={stage} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`h-1.5 w-full rounded-full transition-colors ${
                      isPast
                        ? "bg-accent"
                        : isCurrent
                        ? "bg-accent/60 animate-pulse"
                        : "bg-white/5"
                    }`}
                  />
                  <span
                    className={`text-[9px] leading-tight ${
                      isCurrent
                        ? "font-medium text-accent"
                        : isPast
                        ? "text-muted"
                        : "text-muted-dim"
                    }`}
                  >
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <span className="text-xs">{t.icon}</span>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none ${
                  tab === t.id
                    ? "bg-accent/15 text-accent"
                    : "bg-white/5 text-muted-dim"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/6 bg-surface p-4">
            <p className="text-xs text-muted">Hosts</p>
            <p className="mt-1 text-2xl font-bold">{hosts.length}</p>
            <p className="text-[10px] text-muted-dim">
              {liveHosts} live, {hosts.length - liveHosts} down
            </p>
          </div>
          <div className="rounded-xl border border-white/6 bg-surface p-4">
            <p className="text-xs text-muted">Findings</p>
            <p className="mt-1 text-2xl font-bold">{findings.length}</p>
            <p className="text-[10px] text-muted-dim">
              {critCount} critical, {highCount} high
            </p>
          </div>
          <div className="rounded-xl border border-white/6 bg-surface p-4">
            <p className="text-xs text-muted">Risk level</p>
            <div className="mt-1">
              {hosts.length > 0 ? (
                <LikelihoodBadge
                  value={hosts.reduce((max, h) =>
                    LIKELIHOOD_ORDER[h.exploitability] >
                    LIKELIHOOD_ORDER[max]
                      ? h.exploitability
                      : max
                  , hosts[0].exploitability)}
                />
              ) : (
                <span className="text-sm text-muted-dim">No hosts</span>
              )}
            </div>
          </div>
          {target.description && (
            <div className="col-span-full rounded-xl border border-white/6 bg-surface p-4">
              <p className="text-xs text-muted">Scope notes</p>
              <p className="mt-1 text-sm">{target.description}</p>
            </div>
          )}
        </div>
      )}

      {tab === "hosts" && <HostsTab targetId={target.id} hosts={hosts} />}
      {tab === "findings" && (
        <FindingsTab targetId={target.id} hosts={hosts} findings={findings} />
      )}
      {tab === "notes" && <NotesTab target={target} />}
    </div>
  );
}
