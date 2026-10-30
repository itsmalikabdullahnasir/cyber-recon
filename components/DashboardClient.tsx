"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import type { Target, Host, Finding, Activity, Scan } from "@/lib/types";
import { TargetCard } from "@/components/TargetCard";
import { SearchBar } from "@/components/SearchBar";
import { FilterChips } from "@/components/FilterChips";
import { RiskScoreGauge } from "@/components/RiskScoreGauge";
import { Donut, AreaChart, BarList } from "@/components/charts";
import { ScanRow } from "@/components/ScanRow";
import { createClient } from "@/lib/supabase/client";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#f43f5e",
  High: "#ec4899",
  Medium: "#f59e0b",
  Low: "#a855f7",
  Info: "#5c5775",
};

export function DashboardClient({
  targets: targetsAll,
  hosts,
  findings: findingsInit,
  activities,
  scans: scansInit,
  userName,
}: {
  targets: Target[];
  hosts: Host[];
  findings: Finding[];
  activities: Activity[];
  scans: Scan[];
  userName: string;
}) {
  // Hide the hidden Scan Console bucket (works even before migration 2 adds the column).
  const targets = targetsAll.filter((t) => !t.is_console);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [findings, setFindings] = useState<Finding[]>(findingsInit);
  const [scans, setScans] = useState<Scan[]>(scansInit);
  const [toasts, setToasts] = useState<{ id: string; text: string; kind: "ok" | "err" }[]>([]);
  const scanStatus = useRef<Map<string, string>>(new Map(scansInit.map((s) => [s.id, s.status])));

  function pushToast(kind: "ok" | "err", text: string) {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, kind }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }

  // Live: scans + findings stream in while you watch.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "scans" }, (payload) => {
        const row = payload.new as Scan;
        if (!row?.id) return;
        const prevStatus = scanStatus.current.get(row.id);
        if (prevStatus !== row.status && (row.status === "done" || row.status === "failed")) {
          pushToast(
            row.status === "done" ? "ok" : "err",
            row.status === "done" ? `✅ ${row.input} — scan complete` : `❌ ${row.input} — scan failed`,
          );
        }
        scanStatus.current.set(row.id, row.status);
        setScans((prev) =>
          [row, ...prev.filter((s) => s.id !== row.id)]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 40),
        );
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "findings" }, (payload) => {
        const row = payload.new as Finding;
        setFindings((prev) => (prev.some((f) => f.id === row.id) ? prev : [row, ...prev]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userName]);

  const hostsByTarget = useMemo(() => groupBy(hosts, (h) => h.target_id), [hosts]);
  const findingsByTarget = useMemo(() => groupBy(findings, (f) => f.target_id), [findings]);

  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const t of targets) cats.set(t.category, (cats.get(t.category) ?? 0) + 1);
    return Array.from(cats.entries()).sort((a, b) => b[1] - a[1]);
  }, [targets]);

  const filtered = useMemo(() => {
    let result = targets;
    if (filter === "High risk") {
      result = result.filter((t) =>
        (hostsByTarget.get(t.id) ?? []).some((h) => h.exploitability === "High" || h.exploitability === "Critical"),
      );
    } else if (filter !== "All") {
      result = result.filter((t) => t.category === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => {
        if (t.name.toLowerCase().includes(q) || t.domain?.toLowerCase().includes(q) || t.ip_range?.toLowerCase().includes(q)) return true;
        if ((hostsByTarget.get(t.id) ?? []).some((h) => h.ip.toLowerCase().includes(q))) return true;
        if ((findingsByTarget.get(t.id) ?? []).some((f) => f.title.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    return result;
  }, [targets, filter, search, hostsByTarget, findingsByTarget]);

  const liveHosts = hosts.filter((h) => h.status === "Live").length;
  const criticalFindings = findings.filter((f) => f.severity === "Critical" || f.severity === "High").length;
  const activeScans = scans.filter((s) => s.status === "queued" || s.status === "running");

  const severityData = useMemo(() => {
    const dist = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
    for (const f of findings) dist[f.severity as keyof typeof dist]++;
    return Object.entries(dist).map(([label, value]) => ({ label, value, color: SEVERITY_COLORS[label] }));
  }, [findings]);

  const riskScore = useMemo(() => {
    if (findings.length === 0) return 0;
    const w = { Critical: 25, High: 15, Medium: 8, Low: 3, Info: 0 };
    const score = findings.reduce((s, f) => s + (w[f.severity as keyof typeof w] ?? 0), 0);
    return Math.min(100, Math.round((score / (findings.length * 10)) * 100));
  }, [findings]);

  // Scan activity over the last 14 days.
  const scanSeries = useMemo(() => {
    const days = 14;
    const buckets = new Array(days).fill(0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (const s of scans) {
      const d = Math.floor((now.getTime() - new Date(s.created_at).setHours(0, 0, 0, 0)) / 86400000);
      if (d >= 0 && d < days) buckets[days - 1 - d]++;
    }
    return buckets;
  }, [scans]);

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-surface p-6">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-dim">Recon workspace</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              Welcome back, <span className="gradient-text">{userName.split("@")[0]}</span>
            </h2>
            <p className="mt-1 text-xs text-muted">
              {targets.length} targets · {hosts.length} hosts · {findings.length} findings
              {activeScans.length > 0 && (
                <span className="ml-2 inline-flex items-center gap-1.5 text-amber-400">
                  <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {activeScans.length} scan{activeScans.length > 1 ? "s" : ""} running
                </span>
              )}
            </p>
          </div>
          <Link
            href="/console"
            className="relative rounded-xl border border-accent/30 bg-accent/15 px-4 py-2.5 text-sm font-semibold text-accent transition-all hover:bg-accent/25 hover:shadow-[0_0_24px_var(--color-accent-glow)]"
          >
            🛰️ Launch a scan
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Targets" value={targets.length} color="#a855f7" series={[1, 2, 2, 3, targets.length]} />
        <KpiCard label="Live hosts" value={liveHosts} sub={`${hosts.length} total`} color="#d946ef" series={[2, 3, 5, 4, liveHosts]} />
        <KpiCard label="Findings" value={findings.length} sub={`${criticalFindings} crit/high`} color="#ec4899" accent={criticalFindings > 0} series={scanSeries} />
        <KpiCard label="Active scans" value={activeScans.length} sub={`${scans.length} total`} color="#f59e0b" live={activeScans.length > 0} series={scanSeries} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="card p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Findings by severity</p>
          <div className="flex items-center gap-5">
            <Donut data={severityData.filter((d) => d.value > 0)} centerValue={findings.length} centerLabel="findings" />
            <div className="flex-1">
              <BarList data={severityData} />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Scan activity · 14d</p>
            <span className="text-[10px] text-muted-dim">{scans.length} total</span>
          </div>
          <AreaChart points={scanSeries} height={120} color="#a855f7" />
          <p className="mt-2 text-[10px] text-muted-dim">
            {scanSeries[scanSeries.length - 1]} today · peak {Math.max(...scanSeries)}/day
          </p>
        </div>

        <div className="card flex items-center justify-center p-5">
          <RiskScoreGauge score={riskScore} label="risk score" />
        </div>
      </div>

      {/* Live scan feed */}
      {scans.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
              Live scan feed
              {activeScans.length > 0 && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400 text-amber-400" />}
            </p>
            <Link href="/console" className="text-[10px] text-accent hover:text-accent-dim">
              Open console →
            </Link>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {scans.slice(0, 6).map((s) => (
              <ScanRow key={s.id} scan={s} />
            ))}
          </div>
        </div>
      )}

      {/* Targets + activity */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
        <div className="flex flex-1 flex-col gap-4">
          <SearchBar value={search} onChange={setSearch} />
          <FilterChips
            categories={categories.map(([cat, count]) => ({ cat, count }))}
            active={filter}
            onSelect={setFilter}
          />

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-8 py-20 text-center">
              <div className="mb-3 text-4xl opacity-20">🎯</div>
              <p className="text-sm font-medium text-muted">No targets found</p>
              <Link href="/targets/new" className="mt-4 inline-flex rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-black transition-all hover:bg-accent-dim">
                + Add target
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t) => (
                <div key={t.id} className="card-hover rounded-2xl">
                  <TargetCard target={t} hosts={hostsByTarget.get(t.id) ?? []} findings={findingsByTarget.get(t.id) ?? []} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-full flex-shrink-0 lg:w-72">
          <div className="card sticky top-6 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Activity</span>
              <span className="text-[10px] text-muted-dim">{activities.length} events</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {activities.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="mb-2 text-2xl opacity-20">📡</div>
                  <p className="text-xs text-muted-dim">No activity yet</p>
                </div>
              ) : (
                activities.slice(0, 18).map((a) => (
                  <div key={a.id} className="flex gap-3 border-b border-white/[0.03] px-4 py-2.5 last:border-0 hover:bg-surface-hover">
                    <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent/50" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-relaxed">
                        <span className="font-medium">{a.user_name ?? "system"}</span> <span className="text-muted">{a.action}</span>
                      </p>
                      {a.detail && <p className="mt-0.5 text-[10px] text-muted-dim line-clamp-1">{a.detail}</p>}
                      <p className="mt-0.5 font-mono text-[10px] text-muted-dim">{timeAgo(a.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Link
        href="/targets/new"
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-2xl font-bold text-black shadow-[0_0_24px_rgba(168,85,247,0.4)] transition-all hover:scale-110"
      >
        +
      </Link>

      {/* Live toasts */}
      <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-slide-in flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium shadow-2xl backdrop-blur ${
              t.kind === "ok"
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                : "border-rose-500/30 bg-rose-500/15 text-rose-200"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sub, color, series, accent, live,
}: {
  label: string; value: number; sub?: string; color: string; series: number[]; accent?: boolean; live?: boolean;
}) {
  return (
    <div className="card card-hover relative overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">{label}</span>
        {live && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400 text-amber-400" />}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className={`text-3xl font-bold tabular-nums ${accent ? "text-rose-400" : ""}`} style={accent ? undefined : { color }}>
          {value}
        </span>
        <div className="h-8 w-20 opacity-80">
          <AreaChart points={series.length ? series : [0, 0]} height={32} color={color} />
        </div>
      </div>
      {sub && <p className="mt-1 text-[10px] text-muted-dim">{sub}</p>}
    </div>
  );
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

function timeAgo(date: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}
