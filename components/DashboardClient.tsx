"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Target, Host, Finding, Activity } from "@/lib/types";
import { LIKELIHOOD_ORDER, STATUS_COLORS, CATEGORY_ICONS } from "@/lib/types";
import { TargetCard } from "@/components/TargetCard";
import { SearchBar } from "@/components/SearchBar";
import { FilterChips } from "@/components/FilterChips";
import { StatCard } from "@/components/StatCard";
import { RiskScoreGauge } from "@/components/RiskScoreGauge";
import { BarChart } from "@/components/BarChart";

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
    for (const t of targets) cats.set(t.category, (cats.get(t.category) ?? 0) + 1);
    return Array.from(cats.entries()).sort((a, b) => b[1] - a[1]);
  }, [targets]);

  const filtered = useMemo(() => {
    let result = targets;
    if (filter === "High risk") {
      result = result.filter((t) => {
        const tHosts = hostsByTarget.get(t.id) ?? [];
        return tHosts.some((h) => h.exploitability === "High" || h.exploitability === "Critical");
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
        if (tFindings.some((f) => f.title.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    return result;
  }, [targets, filter, search, hostsByTarget, findingsByTarget]);

  const highRisk = hosts.filter((h) => h.exploitability === "High" || h.exploitability === "Critical").length;
  const criticalFindings = findings.filter((f) => f.severity === "Critical" || f.severity === "High").length;
  const liveHosts = hosts.filter((h) => h.status === "Live").length;

  // Risk score: 0-100 based on findings severity
  const riskScore = useMemo(() => {
    if (findings.length === 0) return 0;
    const weights = { Critical: 25, High: 15, Medium: 8, Low: 3, Info: 0 };
    let score = 0;
    for (const f of findings) {
      score += weights[f.severity as keyof typeof weights] ?? 0;
    }
    return Math.min(100, Math.round((score / (findings.length * 10)) * 100));
  }, [findings]);

  // Status distribution for bar chart
  const statusDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const t of targets) {
      dist[t.status] = (dist[t.status] ?? 0) + 1;
    }
    return Object.entries(dist).map(([label, value]) => ({ label, value }));
  }, [targets]);

  // Severity distribution for bar chart
  const severityBars = useMemo(() => {
    const dist = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
    for (const f of findings) dist[f.severity as keyof typeof dist]++;
    return Object.entries(dist)
      .filter(([, v]) => v > 0)
      .map(([label, value]) => ({ label, value }));
  }, [findings]);

  const severityColors: Record<string, string> = {
    Critical: "#f43f5e",
    High: "#ec4899",
    Medium: "#f59e0b",
    Low: "#a855f7",
    Info: "#5c5775",
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top section: Stat cards + Risk Gauge */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* Stat cards grid */}
        <div className="flex-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon="🎯"
            label="Your Attack Surface"
            value={hosts.length}
            sub={`${liveHosts} live hosts`}
            sparkData={[3, 5, 4, 7, 6, 8, hosts.length]}
            sparkColor="#a855f7"
          />
          <StatCard
            icon="🖥️"
            label="Targets"
            value={targets.length}
            sub={`${new Set(targets.map((t) => t.category)).size} categories`}
            sparkData={[1, 2, 2, 3, targets.length]}
            sparkColor="#d946ef"
          />
          <StatCard
            icon="⚠️"
            label="High Risk"
            value={highRisk}
            accent={highRisk > 0}
            sub="critical + high hosts"
            sparkData={[0, 1, 0, 2, 1, highRisk]}
            sparkColor="#f43f5e"
          />
          <StatCard
            icon="🐛"
            label="Findings"
            value={findings.length}
            accent={criticalFindings > 0}
            sub={`${criticalFindings} critical/high`}
            sparkData={[0, 2, 1, 3, 5, findings.length]}
            sparkColor="#ec4899"
          />
        </div>

        {/* Risk Score Gauge */}
        <div className="flex items-center justify-center rounded-xl border border-white/5 bg-surface p-6 lg:w-[200px]">
          <RiskScoreGauge score={riskScore} label="risk score" />
        </div>
      </div>

      {/* Severity distribution + Status bar chart */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Severity bars */}
        {severityBars.length > 0 && (
          <div className="rounded-xl border border-white/5 bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
                Findings by severity
              </span>
              <span className="text-[10px] text-muted-dim">{findings.length} total</span>
            </div>
            <BarChart
              data={severityBars}
              colors={severityBars.map((d) => severityColors[d.label] ?? "#a855f7")}
              height={80}
            />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {severityBars.map((d) => (
                <div key={d.label} className="flex items-center gap-1.5 text-[10px] text-muted">
                  <span className="h-2 w-2 rounded-sm" style={{ background: severityColors[d.label] }} />
                  {d.label}: {d.value}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status distribution */}
        {statusDistribution.length > 0 && (
          <div className="rounded-xl border border-white/5 bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
                Targets by status
              </span>
            </div>
            <BarChart
              data={statusDistribution}
              colors={["#5c5775", "#818cf8", "#a855f7", "#d946ef", "#f59e0b", "#ec4899", "#f43f5e", "#10b981"]}
              height={80}
            />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {statusDistribution.map((d) => (
                <div key={d.label} className="text-[10px] text-muted">
                  {d.label}: {d.value}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main content: Targets + Activity */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <SearchBar value={search} onChange={setSearch} />
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
                  className="group flex items-center gap-2.5 rounded-lg border border-white/5 bg-surface px-3.5 py-2.5 text-sm transition-all duration-200 hover:border-accent/20 hover:bg-surface-hover hover:shadow-[0_0_20px_rgba(168,85,247,0.06)]"
                >
                  <span className="text-base transition-transform duration-200 group-hover:scale-110">
                    {CATEGORY_ICONS[cat] ?? "📁"}
                  </span>
                  <span className="font-medium">{cat}</span>
                  <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-dim transition-colors group-hover:bg-accent/10 group-hover:text-accent">
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Targets grid */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/8 px-8 py-20 text-center transition-colors hover:border-accent/15">
              <div className="mb-3 text-4xl opacity-20">🎯</div>
              <p className="text-sm font-medium text-muted">No targets found</p>
              <Link
                href="/targets/new"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-black transition-all duration-200 hover:bg-accent-dim hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
              >
                + Add target
              </Link>
            </div>
          ) : (
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
          )}

          <Link
            href="/targets/new"
            className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-2xl font-bold text-black shadow-[0_0_24px_rgba(168,85,247,0.4)] transition-all duration-300 hover:scale-110 hover:shadow-[0_0_36px_rgba(168,85,247,0.5)]"
          >
            +
          </Link>
        </div>

        {/* Activity sidebar */}
        <div className="w-full flex-shrink-0 lg:w-72">
          <div className="sticky top-6 rounded-xl border border-white/5 bg-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
                Activity
              </span>
              <span className="text-[10px] text-muted-dim">{activities.length} events</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {activities.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="mb-2 text-2xl opacity-20">📡</div>
                  <p className="text-xs text-muted-dim">No activity yet</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {activities.slice(0, 15).map((a) => (
                    <div
                      key={a.id}
                      className="flex gap-3 border-b border-white/[0.03] px-4 py-2.5 transition-colors hover:bg-surface-hover last:border-0"
                    >
                      <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent/50" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-relaxed">
                          <span className="font-medium text-foreground">{a.user_name ?? "system"}</span>{" "}
                          <span className="text-muted">{a.action}</span>
                        </p>
                        {a.detail && (
                          <p className="mt-0.5 text-[10px] text-muted-dim line-clamp-1">{a.detail}</p>
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
