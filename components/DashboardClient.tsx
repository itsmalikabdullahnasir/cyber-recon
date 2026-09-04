"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Target, Host, Finding, Activity } from "@/lib/types";
import {
  LIKELIHOOD_ORDER,
  STATUS_COLORS,
  CATEGORY_ICONS,
} from "@/lib/types";
import { TargetCard } from "@/components/TargetCard";
import { SearchBar } from "@/components/SearchBar";
import { FilterChips } from "@/components/FilterChips";

export function DashboardClient({
  targets,
  hosts,
  findings,
  activities,
  userName,
}: {
  targets: Target[];
  hosts: Host[];
  findings: Finding[];
  activities: Activity[];
  userName: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [view, setView] = useState<"grid" | "list">("grid");

  const hostsByTarget = useMemo(() => {
    const map = new Map<string, Host[]>();
    for (const h of hosts) {
      const list = map.get(h.target_id) ?? [];
      list.push(h);
      map.set(h.target_id, list);
    }
    return map;
  }, [hosts]);

  const findingsByTarget = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of findings) {
      const list = map.get(f.target_id) ?? [];
      list.push(f);
      map.set(f.target_id, list);
    }
    return map;
  }, [findings]);

  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const t of targets) {
      cats.set(t.category, (cats.get(t.category) ?? 0) + 1);
    }
    return Array.from(cats.entries()).sort((a, b) => b[1] - a[1]);
  }, [targets]);

  const filtered = useMemo(() => {
    let result = targets;

    if (filter === "High risk") {
      result = result.filter((t) => {
        const tHosts = hostsByTarget.get(t.id) ?? [];
        return tHosts.some(
          (h) =>
            h.exploitability === "High" || h.exploitability === "Critical"
        );
      });
    } else if (filter !== "All") {
      result = result.filter((t) => t.category === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => {
        if (t.name.toLowerCase().includes(q)) return true;
        if (t.domain?.toLowerCase().includes(q)) return true;
        if (t.ip_range?.toLowerCase().includes(q)) return true;
        const tHosts = hostsByTarget.get(t.id) ?? [];
        if (tHosts.some((h) => h.ip.toLowerCase().includes(q))) return true;
        const tFindings = findingsByTarget.get(t.id) ?? [];
        if (tFindings.some((f) => f.title.toLowerCase().includes(q)))
          return true;
        return false;
      });
    }

    return result;
  }, [targets, filter, search, hostsByTarget, findingsByTarget]);

  const severityDistribution = useMemo(() => {
    const dist = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
    for (const f of findings) {
      dist[f.severity as keyof typeof dist]++;
    }
    return dist;
  }, [findings]);

  const highRisk = hosts.filter(
    (h) => h.exploitability === "High" || h.exploitability === "Critical"
  ).length;

  const criticalFindings = findings.filter(
    (f) => f.severity === "Critical" || f.severity === "High"
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          icon="🎯"
          label="Targets"
          value={targets.length}
          sub={`${new Set(targets.map((t) => t.category)).size} categories`}
        />
        <StatCard
          icon="🖥️"
          label="Hosts"
          value={hosts.length}
          sub={`${hosts.filter((h) => h.status === "Live").length} live`}
        />
        <StatCard
          icon="⚠️"
          label="High risk"
          value={highRisk}
          accent={highRisk > 0}
          sub="hosts"
        />
        <StatCard
          icon="🐛"
          label="Findings"
          value={findings.length}
          accent={criticalFindings > 0}
          sub={`${criticalFindings} critical/high`}
        />
        <StatCard
          icon="📝"
          label="Activities"
          value={activities.length}
          sub="logged"
        />
      </div>

      {/* Severity distribution bar */}
      {findings.length > 0 && (
        <div className="rounded-xl border border-white/6 bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">
              Finding severity distribution
            </span>
            <span className="text-[10px] text-muted-dim">
              {findings.length} total
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full">
            {(["Critical", "High", "Medium", "Low", "Info"] as const).map(
              (sev) => {
                const count =
                  severityDistribution[sev as keyof typeof severityDistribution];
                if (count === 0) return null;
                const pct = (count / findings.length) * 100;
                const colors: Record<string, string> = {
                  Critical: "bg-red-500",
                  High: "bg-red-400",
                  Medium: "bg-amber-400",
                  Low: "bg-teal-400",
                  Info: "bg-slate-400",
                };
                return (
                  <div
                    key={sev}
                    className={`${colors[sev]} h-full transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${sev}: ${count}`}
                  />
                );
              }
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {(["Critical", "High", "Medium", "Low", "Info"] as const).map(
              (sev) => {
                const count =
                  severityDistribution[sev as keyof typeof severityDistribution];
                const dotColors: Record<string, string> = {
                  Critical: "bg-red-500",
                  High: "bg-red-400",
                  Medium: "bg-amber-400",
                  Low: "bg-teal-400",
                  Info: "bg-slate-400",
                };
                return (
                  <div key={sev} className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${dotColors[sev]}`}
                    />
                    {sev}: {count}
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* Left: targets */}
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <SearchBar value={search} onChange={setSearch} />
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setView("grid")}
                  className={`rounded p-1.5 transition-colors ${
                    view === "grid"
                      ? "bg-white/5 text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                  title="Grid view"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                </button>
                <button
                  onClick={() => setView("list")}
                  className={`rounded p-1.5 transition-colors ${
                    view === "list"
                      ? "bg-white/5 text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                  title="List view"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <FilterChips
            categories={categories.map(([cat, count]) => ({ cat, count }))}
            active={filter}
            onSelect={setFilter}
          />

          {/* Category folders */}
          {filter === "All" && !search && (
            <div className="flex flex-wrap gap-2">
              {categories.map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className="group flex items-center gap-2 rounded-lg border border-white/6 bg-surface px-3 py-2 text-sm transition-all hover:border-accent/20 hover:bg-surface-hover"
                >
                  <span className="text-base">
                    {CATEGORY_ICONS[cat] ?? "📁"}
                  </span>
                  <span className="font-medium">{cat}</span>
                  <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-muted group-hover:bg-accent/10 group-hover:text-accent">
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Targets */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/8 px-8 py-20 text-center">
              <div className="mb-3 text-3xl opacity-30">🎯</div>
              <p className="text-sm text-muted">No targets found</p>
              <Link
                href="/targets/new"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-accent-dim"
              >
                + Add first target
              </Link>
            </div>
          ) : view === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t) => (
                <TargetCard
                  key={t.id}
                  target={t}
                  hosts={hostsByTarget.get(t.id) ?? []}
                  findings={findingsByTarget.get(t.id) ?? []}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((t) => (
                <TargetListRow
                  key={t.id}
                  target={t}
                  hosts={hostsByTarget.get(t.id) ?? []}
                  findings={findingsByTarget.get(t.id) ?? []}
                />
              ))}
            </div>
          )}

          {/* Add target FAB */}
          <Link
            href="/targets/new"
            className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-2xl font-bold text-black shadow-lg shadow-accent/20 transition-all hover:scale-105 hover:bg-accent-dim"
          >
            +
          </Link>
        </div>

        {/* Right sidebar: activity feed */}
        <div className="w-full flex-shrink-0 lg:w-72">
          <div className="sticky top-6 rounded-xl border border-white/6 bg-surface">
            <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
              <span className="text-xs font-medium">Recent activity</span>
              <span className="text-[10px] text-muted-dim">
                {activities.length} events
              </span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {activities.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted">
                  No activity yet
                </div>
              ) : (
                <div className="flex flex-col">
                  {activities.slice(0, 15).map((a) => (
                    <div
                      key={a.id}
                      className="flex gap-3 border-b border-white/3 px-4 py-2.5 last:border-0"
                    >
                      <div className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent/60" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs">
                          <span className="font-medium text-foreground">
                            {a.user_name ?? "system"}
                          </span>{" "}
                          <span className="text-muted">{a.action}</span>
                        </p>
                        {a.detail && (
                          <p className="mt-0.5 text-[10px] text-muted-dim line-clamp-1">
                            {a.detail}
                          </p>
                        )}
                        <p className="mt-0.5 font-mono text-[10px] text-muted-dim">
                          {formatTimeAgo(a.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
  sub,
}: {
  icon: string;
  label: string;
  value: number;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/6 bg-surface p-4 transition-colors hover:bg-surface-hover">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-sm opacity-60">{icon}</span>
      </div>
      <p
        className={`mt-1 text-2xl font-bold tracking-tight ${
          accent ? "text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-dim">{sub}</p>}
    </div>
  );
}

function TargetListRow({
  target,
  hosts,
  findings,
}: {
  target: Target;
  hosts: Host[];
  findings: Finding[];
}) {
  const topRisk = hosts.length > 0
    ? hosts.reduce((max, h) =>
        LIKELIHOOD_ORDER[h.exploitability] > LIKELIHOOD_ORDER[max]
          ? h.exploitability
          : max
      , hosts[0].exploitability)
    : null;

  const critCount = findings.filter(
    (f) => f.severity === "Critical" || f.severity === "High"
  ).length;

  return (
    <Link
      href={`/targets/${target.id}`}
      className="group flex items-center gap-4 rounded-lg border border-white/4 px-4 py-3 transition-all hover:border-white/10 hover:bg-surface-hover"
    >
      <span className="text-lg">{CATEGORY_ICONS[target.category] ?? "📁"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{target.name}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              STATUS_COLORS[target.status] ?? "bg-white/5 text-muted"
            }`}
          >
            {target.status}
          </span>
          {target.scope === "Out of Scope" && (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
              Out of scope
            </span>
          )}
        </div>
        <div className="mt-0.5 flex gap-x-3 text-xs text-muted">
          {target.ip_range && (
            <span className="font-mono">{target.ip_range}</span>
          )}
          <span>
            {hosts.length} host{hosts.length !== 1 ? "s" : ""}
          </span>
          <span>
            {findings.length} finding{findings.length !== 1 ? "s" : ""}
          </span>
          {critCount > 0 && (
            <span className="text-red-400">{critCount} critical</span>
          )}
        </div>
      </div>
      <span className="text-xs text-muted">→</span>
    </Link>
  );
}

function formatTimeAgo(date: string) {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}
