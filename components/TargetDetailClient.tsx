"use client";

import { useState } from "react";
import type { Target, Host, Finding, Subdomain } from "@/lib/types";
import { STATUS_COLORS, CATEGORY_ICONS, LIKELIHOOD_ORDER } from "@/lib/types";
import { LikelihoodBadge } from "@/components/LikelihoodBadge";
import { HostsTab } from "@/components/HostsTab";
import { FindingsTab } from "@/components/FindingsTab";
import { NotesTab } from "@/components/NotesTab";
import { SubdomainsTab } from "@/components/SubdomainsTab";
import { NmapPanel } from "@/components/NmapPanel";
import { CVSSCalculator } from "@/components/CVSSCalculator";

type Tab = "hosts" | "findings" | "notes" | "overview" | "subdomains" | "nmap" | "cvss";

export function TargetDetailClient({
  target, hosts, findings, subdomains,
}: {
  target: Target; hosts: Host[]; findings: Finding[]; subdomains: Subdomain[];
}) {
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { id: Tab; label: string; icon: string; count?: number }[] = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "subdomains", label: "Subdomains", icon: "🌐", count: subdomains.length },
    { id: "hosts", label: "Hosts", icon: "🖥️", count: hosts.length },
    { id: "findings", label: "Findings", icon: "🐛", count: findings.length },
    { id: "nmap", label: "Nmap", icon: "🔍" },
    { id: "cvss", label: "CVSS", icon: "📐" },
    { id: "notes", label: "Notes", icon: "📝" },
  ];

  const critCount = findings.filter((f) => f.severity === "Critical").length;
  const highCount = findings.filter((f) => f.severity === "High").length;
  const liveHosts = hosts.filter((h) => h.status === "Live").length;

  const workflowStages = [
    "Not Started", "Recon", "Scanning", "Enumeration",
    "Exploitation", "Post-Exploitation", "Reporting", "Done",
  ];
  const currentStageIdx = workflowStages.indexOf(target.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent/15 to-fuchsia/15 text-2xl shadow-[0_0_20px_rgba(168,85,247,0.15)]">
            {CATEGORY_ICONS[target.category] ?? "📁"}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{target.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              {target.domain && <span>{target.domain}</span>}
              {target.ip_range && <span className="font-mono">{target.ip_range}</span>}
              {target.owner && <span>Owner: {target.owner}</span>}
              {target.methodology && (
                <span className="rounded-md border border-white/5 bg-white/[0.03] px-1.5 py-0.5">{target.methodology}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[target.status] ?? "bg-white/5 text-muted border-white/10"}`}>
            {target.status}
          </span>
          {target.scope === "Out of Scope" && (
            <span className="rounded-md border border-rose-500/20 bg-rose-500/8 px-2.5 py-0.5 text-[11px] font-medium text-rose-400">⚠ Out of scope</span>
          )}
          {target.priority !== "None" && (
            <span className={`rounded-md border px-2.5 py-0.5 text-[11px] font-medium ${
              target.priority === "Critical" ? "border-rose-500/20 bg-rose-500/8 text-rose-400" :
              target.priority === "High" ? "border-pink-500/20 bg-pink-500/8 text-pink-400" :
              target.priority === "Medium" ? "border-amber-500/20 bg-amber-500/8 text-amber-400" :
              "border-emerald-500/20 bg-emerald-500/8 text-emerald-400"
            }`}>{target.priority} priority</span>
          )}
        </div>

        <div className="rounded-xl border border-white/5 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Pentest workflow</span>
            <span className="text-[10px] text-muted-dim/60">Stage {currentStageIdx + 1}/{workflowStages.length}</span>
          </div>
          <div className="flex items-center gap-1">
            {workflowStages.map((stage, i) => {
              const isPast = i < currentStageIdx;
              const isCurrent = i === currentStageIdx;
              return (
                <div key={stage} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className={`h-1 w-full rounded-full transition-all duration-500 ${
                    isPast ? "bg-accent" :
                    isCurrent ? "bg-gradient-to-r from-accent to-fuchsia shadow-[0_0_8px_rgba(168,85,247,0.3)]" :
                    "bg-white/5"
                  }`} />
                  <span className={`text-[9px] leading-tight text-center ${
                    isCurrent ? "font-semibold text-accent" : isPast ? "text-muted" : "text-muted-dim/60"
                  }`}>{stage}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-white/5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-all whitespace-nowrap ${
            tab === t.id ? "border-accent text-foreground" : "border-transparent text-muted-dim hover:text-foreground"
          }`}>
            <span>{t.icon}</span>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none ${
                tab === t.id ? "bg-accent/15 text-accent" : "bg-white/5 text-muted-dim"
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/5 bg-surface p-4 transition-all hover:border-white/8">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Subdomains</p>
            <p className="mt-2 text-3xl font-bold">{subdomains.length}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-surface p-4 transition-all hover:border-white/8">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Hosts</p>
            <p className="mt-2 text-3xl font-bold">{hosts.length}</p>
            <p className="mt-1 text-[10px] text-muted-dim">{liveHosts} live</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-surface p-4 transition-all hover:border-white/8">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Findings</p>
            <p className="mt-2 text-3xl font-bold">{findings.length}</p>
            <p className="mt-1 text-[10px] text-muted-dim">{critCount} critical, {highCount} high</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-surface p-4 transition-all hover:border-white/8">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Risk level</p>
            <div className="mt-2">
              {hosts.length > 0 ? (
                <LikelihoodBadge value={hosts.reduce((max, h) =>
                  LIKELIHOOD_ORDER[h.exploitability] > LIKELIHOOD_ORDER[max] ? h.exploitability : max
                , hosts[0].exploitability)} />
              ) : (
                <span className="text-sm text-muted-dim">No hosts</span>
              )}
            </div>
          </div>
          {target.description && (
            <div className="col-span-full rounded-xl border border-white/5 bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Scope notes</p>
              <p className="mt-2 text-sm leading-relaxed">{target.description}</p>
            </div>
          )}
        </div>
      )}

      {tab === "subdomains" && <SubdomainsTab targetId={target.id} subdomains={subdomains} />}
      {tab === "hosts" && <HostsTab targetId={target.id} hosts={hosts} />}
      {tab === "findings" && <FindingsTab targetId={target.id} hosts={hosts} findings={findings} />}
      {tab === "nmap" && <NmapPanel targetId={target.id} targetName={target.name} />}
      {tab === "cvss" && <CVSSCalculator />}
      {tab === "notes" && <NotesTab target={target} />}
    </div>
  );
}
