"use client";

import { useState } from "react";
import type { Target, Host, Finding } from "@/lib/types";
import { HostsTab } from "@/components/HostsTab";
import { FindingsTab } from "@/components/FindingsTab";
import { NotesTab } from "@/components/NotesTab";

type Tab = "hosts" | "findings" | "notes";

export function TargetDetailClient({
  target,
  hosts,
  findings,
}: {
  target: Target;
  hosts: Host[];
  findings: Finding[];
}) {
  const [tab, setTab] = useState<Tab>("hosts");

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "hosts", label: "Hosts", count: hosts.length },
    { id: "findings", label: "Findings", count: findings.length },
    { id: "notes", label: "Notes", count: 0 },
  ];

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {target.name}
          </h1>
          <span className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-muted">
            {target.status}
          </span>
          {target.scope === "Out of Scope" && (
            <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-400">
              Out of scope
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {target.category && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent/60" />
              {target.category}
            </span>
          )}
          {target.domain && <span>{target.domain}</span>}
          {target.ip_range && (
            <span className="font-mono">{target.ip_range}</span>
          )}
          {target.owner && <span>Owner: {target.owner}</span>}
        </div>
      </div>

      <div className="flex gap-1 border-b border-white/6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  tab === t.id
                    ? "bg-accent/15 text-accent"
                    : "bg-white/5 text-muted"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "hosts" && <HostsTab targetId={target.id} hosts={hosts} />}
      {tab === "findings" && (
        <FindingsTab targetId={target.id} hosts={hosts} findings={findings} />
      )}
      {tab === "notes" && <NotesTab target={target} />}
    </>
  );
}
