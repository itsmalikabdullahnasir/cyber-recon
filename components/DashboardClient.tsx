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
import { EncryptButton } from "@/components/EncryptButton";
import { scanRiskScore } from "@/lib/risk";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#f43f5e",
  High: "#ec4899",
  Medium: "#f59e0b",
  Low: "#a855f7",
  Info: "#5c5775",
};
type MetricKey = "targets" | "hosts" | "liveHosts" | "findings" | "criticalFindings" | "scans" | "activeScans";
type MetricState = { value: number | null; error: string | null };

function NowScanning({ scan, loading, error, onRetry }: { scan: Scan | null; loading?: boolean; error?: string | null; onRetry?: () => void }) {
  const stage = scan?.stage ? scan.stages?.[scan.stage] : null;
  const host = stage && typeof stage === "object"
    ? ["host", "ip", "current_host", "current_ip", "target"].map((key) => stage[key]).find((value) => typeof value === "string")
    : null;

  return (
    <div className={`rounded-xl border p-4 ${scan ? "border-amber-500/30 bg-amber-500/[0.08]" : "border-white/5 bg-surface"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`h-2 w-2 rounded-full ${scan ? "animate-pulse bg-amber-400" : "bg-muted-dim"}`} />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Now scanning</p>
          <p className={`mt-1 text-sm font-semibold ${scan ? "text-amber-200" : "text-muted"}`}>
            {loading ? "Checking scan status…" : error ? "Couldn’t load scan status" : scan ? scan.input : "Idle — queue paused"}
          </p>
        </div>
        {error && (
          <div className="ml-auto flex items-center gap-2 text-[10px] text-rose-300">
            <span title={error}>Query failed</span>
            <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-rose-200">Retry</button>
          </div>
        )}
        {scan && !error && !loading && (
          <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-medium text-amber-300">
              {scan.stage ?? "starting"}
            </span>
            {host && <span className="font-mono text-amber-200/80">{host}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function DashboardClient({
  targets: targetsAll,
  hosts,
  findings: findingsInit,
  activities,
  scans: scansInit,
  runningScan: runningScanInit,
  totals,
  countErrors: initialCountErrors,
  runningScanError: runningScanErrorInit,
  userName,
}: {
  targets: Target[];
  hosts: Host[];
  findings: Finding[];
  activities: Activity[];
  scans: Scan[];
  runningScan: Scan | null;
  totals: {
    targets: number | null;
    hosts: number | null;
    liveHosts: number | null;
    findings: number | null;
    criticalFindings: number | null;
    scans: number | null;
    activeScans: number | null;
    severity: Record<string, number | null>;
  };
  countErrors: Record<MetricKey, string | null> & { severity: Record<string, string | null> };
  runningScanError: string | null;
  userName: string;
}) {
  // Hide the hidden Scan Console bucket (works even before migration 2 adds the column).
  const targets = targetsAll.filter((t) => !t.is_console);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [risk, setRisk] = useState<"All" | "Critical" | "High" | "Medium" | "Low">("All");
  const [scanSort, setScanSort] = useState("date-desc");
  const [visible, setVisible] = useState(20);
  const [visibleScanResults, setVisibleScanResults] = useState(20);
  const [findings, setFindings] = useState<Finding[]>(findingsInit);
  const [scans, setScans] = useState<Scan[]>(scansInit);
  const [runningScan, setRunningScan] = useState<Scan | null>(runningScanInit);
  const [counts, setCounts] = useState(totals);
  const [countErrors, setCountErrors] = useState(initialCountErrors);
  const [countLoading, setCountLoading] = useState(false);
  const [runningScanError, setRunningScanError] = useState(runningScanErrorInit);
  const [runningScanLoading, setRunningScanLoading] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; text: string; kind: "ok" | "err" }[]>([]);
  const scanStatus = useRef<Map<string, string>>(new Map(scansInit.map((s) => [s.id, s.status])));
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshPending = useRef(false);
  const retryingMetric = useRef<MetricKey | null>(null);

  function pushToast(kind: "ok" | "err", text: string) {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, kind }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }

  const refreshCounts = async () => {
    setCountLoading(true);
    const supabase = createClient();
    const requests = await Promise.all([
      supabase.from("targets").select("id", { count: "exact", head: true }).eq("is_console", false),
      supabase.from("hosts").select("id", { count: "exact", head: true }),
      supabase.from("hosts").select("id", { count: "exact", head: true }).eq("status", "Live"),
      supabase.from("findings").select("id", { count: "exact", head: true }),
      supabase.from("findings").select("id", { count: "exact", head: true }).in("severity", ["Critical", "High"]),
      supabase.from("scans").select("id", { count: "exact", head: true }),
      supabase.from("scans").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
      ...(["Critical", "High", "Medium", "Low", "Info"] as const).map((severity) =>
        supabase.from("findings").select("id", { count: "exact", head: true }).eq("severity", severity),
      ),
    ]);
    setCounts({
      targets: requests[0].count,
      hosts: requests[1].count,
      liveHosts: requests[2].count,
      findings: requests[3].count,
      criticalFindings: requests[4].count,
      scans: requests[5].count,
      activeScans: requests[6].count,
      severity: {
        Critical: requests[7].count,
        High: requests[8].count,
        Medium: requests[9].count,
        Low: requests[10].count,
        Info: requests[11].count,
      },
    });
    setCountErrors({
      targets: requests[0].error?.message ?? null,
      hosts: requests[1].error?.message ?? null,
      liveHosts: requests[2].error?.message ?? null,
      findings: requests[3].error?.message ?? null,
      criticalFindings: requests[4].error?.message ?? null,
      scans: requests[5].error?.message ?? null,
      activeScans: requests[6].error?.message ?? null,
      severity: Object.fromEntries(["Critical", "High", "Medium", "Low", "Info"].map((key, index) => [key, requests[index + 7].error?.message ?? null])),
    });
    setCountLoading(false);
  };

  const retryMetric = async (key: MetricKey) => {
    if (retryingMetric.current === key) return;
    retryingMetric.current = key;
    const supabase = createClient();
    const queries = {
      targets: supabase.from("targets").select("id", { count: "exact", head: true }).eq("is_console", false),
      hosts: supabase.from("hosts").select("id", { count: "exact", head: true }),
      liveHosts: supabase.from("hosts").select("id", { count: "exact", head: true }).eq("status", "Live"),
      findings: supabase.from("findings").select("id", { count: "exact", head: true }),
      criticalFindings: supabase.from("findings").select("id", { count: "exact", head: true }).in("severity", ["Critical", "High"]),
      scans: supabase.from("scans").select("id", { count: "exact", head: true }),
      activeScans: supabase.from("scans").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
    };
    const result = await queries[key];
    setCounts((current) => ({ ...current, [key]: result.count }));
    setCountErrors((current) => ({ ...current, [key]: result.error?.message ?? null }));
    retryingMetric.current = null;
  };

  const scheduleRefresh = () => {
    refreshPending.current = true;
    setRunningScanLoading(true);
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(async () => {
      refreshTimer.current = null;
      if (!refreshPending.current) return;
      refreshPending.current = false;
      const supabase = createClient();
      const [{ data }, runningResult] = await Promise.all([
        supabase.from("scans").select("*").order("created_at", { ascending: false }).range(0, 39),
        supabase.from("scans").select("*").eq("status", "running").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (data) setScans(data);
      setRunningScan(runningResult.data);
      setRunningScanError(runningResult.error?.message ?? null);
      await refreshCounts();
    }, 1500);
  };

  // Live updates are coalesced so a busy worker queue cannot trigger a render
  // for every host/finding/scan row written to Supabase.
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
        scheduleRefresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "findings" }, (payload) => {
        const row = payload.new as Finding;
        scheduleRefresh();
      })
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [userName]);

  // Lightly debounce the search box so filtering doesn't run on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const hostsByTarget = useMemo(() => groupBy(hosts, (h) => h.target_id), [hosts]);
  const findingsByTarget = useMemo(() => groupBy(findings, (f) => f.target_id), [findings]);
  const scansByTarget = useMemo(() => groupBy(scans, (s) => s.target_id), [scans]);
  // Group hosts/findings by the scan that produced them → per-scan risk + counts.
  const hostsByScan = useMemo(() => groupBy(hosts.filter((h) => h.scan_id), (h) => h.scan_id as string), [hosts]);
  const findingsByScan = useMemo(() => groupBy(findings.filter((f) => f.scan_id), (f) => f.scan_id as string), [findings]);
  const targetNameById = useMemo(() => new Map(targets.map((t) => [t.id, t.name])), [targets]);

  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const t of targets) cats.set(t.category, (cats.get(t.category) ?? 0) + 1);
    return Array.from(cats.entries()).sort((a, b) => b[1] - a[1]);
  }, [targets]);

  // Real per-group risk (0–100) from the group's hosts' risk_score + finding
  // severity — the same score shown on scan cards, so the filter matches the UI.
  const groupRisk = (id: string) => scanRiskScore(hostsByTarget.get(id) ?? [], findingsByTarget.get(id) ?? []);

  const filtered = useMemo(() => {
    let result = targets;
    if (filter === "High risk") {
      // "High risk" tab → groups scoring 60+.
      result = result.filter((t) => groupRisk(t.id) >= 60);
    } else if (filter !== "All") {
      result = result.filter((t) => t.category === filter);
    }
    if (risk !== "All") {
      // Dropdown thresholds on the 0–100 score (Critical 80+, High 60+, Medium 40+, Low 20+).
      const min = { Critical: 80, High: 60, Medium: 40, Low: 20 }[risk];
      result = result.filter((t) => groupRisk(t.id) >= min);
    }
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => {
        if (t.name.toLowerCase().includes(q) || t.domain?.toLowerCase().includes(q) || t.ip_range?.toLowerCase().includes(q)) return true;
        if ((hostsByTarget.get(t.id) ?? []).some((h) => h.ip.toLowerCase().includes(q) || h.hostname?.toLowerCase().includes(q))) return true;
        if ((findingsByTarget.get(t.id) ?? []).some((f) => f.title.toLowerCase().includes(q) || f.cve_id?.toLowerCase().includes(q))) return true;
        if ((scansByTarget.get(t.id) ?? []).some((s) => `${s.input} ${s.mode} ${s.status}`.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, filter, risk, debouncedSearch, hostsByTarget, findingsByTarget, scansByTarget]);

  const liveHosts = counts.liveHosts;
  const criticalFindings = counts.criticalFindings;
  const activeScans = counts.activeScans;

  const severityData = useMemo(() => {
    return Object.entries(counts.severity)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .map(([label, value]) => ({ label, value, color: SEVERITY_COLORS[label] }));
  }, [counts.severity]);

  const riskScore = useMemo(() => {
    if (counts.findings === null) return 0;
    if (counts.findings === 0) return 0;
    const w = { Critical: 25, High: 15, Medium: 8, Low: 3, Info: 0 };
    const score = Object.entries(counts.severity).reduce((s, [severity, count]) => s + (w[severity as keyof typeof w] ?? 0) * (count ?? 0), 0);
    return Math.min(100, Math.round((score / (counts.findings * 10)) * 100));
  }, [counts]);

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

  const scanRiskById = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of scans) m.set(s.id, scanRiskScore(hostsByScan.get(s.id) ?? [], findingsByScan.get(s.id) ?? []));
    return m;
  }, [scans, hostsByScan, findingsByScan]);

  const filteredScans = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const base = q
      ? scans.filter((scan) =>
          [scan.input, scan.mode, scan.status, scan.requested_by_email ?? "", targetNameById.get(scan.target_id) ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : scans.slice();
    // FEATURE 4 — sort finished + running scans by the chosen key/direction.
    const [key, dirStr] = scanSort.split("-");
    const dir = dirStr === "asc" ? 1 : -1;
    base.sort((a, b) => {
      if (key === "risk") return ((scanRiskById.get(a.id) ?? 0) - (scanRiskById.get(b.id) ?? 0)) * dir;
      if (key === "findings") return ((findingsByScan.get(a.id)?.length ?? 0) - (findingsByScan.get(b.id)?.length ?? 0)) * dir;
      if (key === "group") return (targetNameById.get(a.target_id) ?? "").localeCompare(targetNameById.get(b.target_id) ?? "") * dir;
      return a.created_at.localeCompare(b.created_at) * dir; // date
    });
    return base;
  }, [scans, debouncedSearch, scanSort, scanRiskById, findingsByScan, targetNameById]);

  useEffect(() => {
    setVisible(20);
    setVisibleScanResults(20);
  }, [search, filter, risk]);

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
              {counts.targets} targets · {counts.hosts} hosts · {counts.findings} findings
              {(activeScans ?? 0) > 0 && (
                <span className="ml-2 inline-flex items-center gap-1.5 text-amber-400">
                  <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {activeScans ?? "—"} scan{(activeScans ?? 0) > 1 ? "s" : ""} running
                </span>
              )}
            </p>
          </div>

          <EncryptButton text="Launch a scan" onClick={() => router.push("/console")} />
        </div>
      </div>
      <NowScanning
        scan={runningScan}
        loading={runningScanLoading}
        error={runningScanError}
        onRetry={() => {
          setRunningScanLoading(true);
          const supabase = createClient();
          void supabase.from("scans").select("*").eq("status", "running").order("started_at", { ascending: false }).limit(1).maybeSingle()
            .then((result) => {
              setRunningScan(result.data);
              setRunningScanError(result.error?.message ?? null);
              setRunningScanLoading(false);
            });
        }}
      />

      {/* KPI row */}
      <div className="animate-fade-in grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Targets" value={counts.targets} error={countErrors.targets} loading={countLoading} onRetry={() => void retryMetric("targets")} color="#a855f7" series={[1, 2, 2, 3, counts.targets ?? 0]} />
        <KpiCard label="Live hosts" value={liveHosts} error={countErrors.liveHosts} loading={countLoading} onRetry={() => void retryMetric("liveHosts")} sub={counts.hosts === null ? undefined : `${counts.hosts} total`} color="#d946ef" series={[2, 3, 5, 4, liveHosts ?? 0]} />
        <KpiCard label="Findings" value={counts.findings} error={countErrors.findings} loading={countLoading} onRetry={() => void retryMetric("findings")} sub={criticalFindings === null ? undefined : `${criticalFindings} crit/high`} color="#ec4899" accent={(criticalFindings ?? 0) > 0} series={scanSeries} />
        <KpiCard label="Active scans" value={activeScans} error={countErrors.activeScans} loading={countLoading} onRetry={() => void retryMetric("activeScans")} sub={counts.scans === null ? undefined : `${counts.scans} total`} color="#f59e0b" live={(activeScans ?? 0) > 0} series={scanSeries} />
      </div>

      {/* Charts */}
      <div className="animate-fade-in grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="card card-hover p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Findings by severity</p>
          <div className="flex items-center gap-5">
            <Donut data={severityData.filter((d) => d.value > 0)} centerValue={counts.findings ?? "—"} centerLabel="findings" />
            <div className="flex-1">
              <BarList data={severityData} />
            </div>
          </div>
        </div>

        <div className="card card-hover p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Scan activity · 14d</p>
            <span className="text-[10px] text-muted-dim">{counts.scans} total</span>
          </div>
          <AreaChart points={scanSeries} height={120} color="#a855f7" />
          <p className="mt-2 text-[10px] text-muted-dim">
            {scanSeries[scanSeries.length - 1]} today · peak {Math.max(...scanSeries)}/day
          </p>
        </div>

        <div className="card card-hover flex items-center justify-center p-5">
          <RiskScoreGauge score={riskScore} label="risk score" />
        </div>
      </div>

      {/* Live scan feed */}
      {scans.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
              Recent scans
              {(activeScans ?? 0) > 0 && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400 text-amber-400" />}
            </p>
            <div className="flex items-center gap-3">
              <select
                value={scanSort}
                onChange={(e) => setScanSort(e.target.value)}
                className="rounded-lg border border-white/10 bg-background px-2 py-1 text-[10px] outline-none focus:border-accent/40"
                title="Sort scans"
              >
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="risk-desc">Risk (high → low)</option>
                <option value="risk-asc">Risk (low → high)</option>
                <option value="findings-desc">Findings (most)</option>
                <option value="findings-asc">Findings (fewest)</option>
                <option value="group-asc">Group (A → Z)</option>
                <option value="group-desc">Group (Z → A)</option>
              </select>
              <span className="text-[10px] text-muted-dim">{filteredScans.length} shown</span>
              <Link href="/console" className="text-[10px] text-accent hover:text-accent-dim">
                Open console →
              </Link>
            </div>
          </div>
          {filteredScans.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-dim">
              No scans match &quot;{search}&quot;.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
            {filteredScans.slice(0, 20).map((s) => (
              <ScanRow
                key={s.id}
                scan={s}
                assignTargets={targets.map((target) => ({ id: target.id, name: target.name }))}
                scanHosts={hostsByScan.get(s.id) ?? []}
                scanFindings={findingsByScan.get(s.id) ?? []}
              />
            ))}
            </div>
          )}
        </div>
      )}

      {/* Targets + activity */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchBar value={search} onChange={setSearch} />
            <select
              value={risk}
              onChange={(e) => { setRisk(e.target.value as typeof risk); setVisible(50); }}
              className="rounded-lg border border-white/10 bg-surface px-2.5 py-2.5 text-xs outline-none focus:border-accent/40"
            >
              <option value="All">All risk</option>
              <option value="Critical">Critical</option>
              <option value="High">High+</option>
              <option value="Medium">Medium+</option>
              <option value="Low">Low+</option>
            </select>
            <span className="text-[11px] text-muted-dim">
              {filtered.length + (filtered.length === 0 ? filteredScans.length : 0)} results
            </span>
          </div>
          <FilterChips
            categories={categories.map(([cat, count]) => ({ cat, count }))}
            active={filter}
            onSelect={setFilter}
          />

          {filtered.length === 0 && filteredScans.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Scan results</p>
                <p className="mt-1 text-[11px] text-muted-dim">
                  Showing scanned IPs and domains matching &quot;{search || "recent scans"}&quot;.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {filteredScans.slice(0, visibleScanResults).map((scan) => (
                  <ScanRow
                    key={`result-${scan.id}`}
                    scan={scan}
                    assignTargets={targets.map((target) => ({ id: target.id, name: target.name }))}
                    scanHosts={hostsByScan.get(scan.id) ?? []}
                    scanFindings={findingsByScan.get(scan.id) ?? []}
                  />
                ))}
              </div>
              {filteredScans.length > visibleScanResults && (
                <button
                  onClick={() => setVisibleScanResults((v) => v + 20)}
                  className="mx-auto rounded-lg border border-white/10 px-4 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
                >
                  Load more scan results ({filteredScans.length - visibleScanResults} more)
                </button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-8 py-20 text-center">
              <div className="mb-3 text-4xl opacity-20">🎯</div>
              <p className="text-sm font-medium text-muted">No targets found</p>
              <Link href="/targets/new" className="mt-4 inline-flex rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-black transition-all hover:bg-accent-dim">
                + Add target
              </Link>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.slice(0, visible).map((t) => (
                  <div key={t.id} className="card-hover rounded-2xl">
                    <TargetCard target={t} hosts={hostsByTarget.get(t.id) ?? []} findings={findingsByTarget.get(t.id) ?? []} />
                  </div>
                ))}
              </div>
              {filtered.length > visible && (
                <button
                  onClick={() => setVisible((v) => v + 20)}
                  className="mx-auto mt-1 rounded-lg border border-white/10 px-4 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
                >
                  Load more ({filtered.length - visible} more)
                </button>
              )}
            </>
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
  label, value, sub, color, series, accent, live, loading, error, onRetry,
}: {
  label: string; value: number | null; sub?: string; color: string; series: number[]; accent?: boolean; live?: boolean;
  loading?: boolean; error?: string | null; onRetry?: () => void;
}) {
  return (
    <div className="card card-hover relative overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">{label}</span>
        {live && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400 text-amber-400" />}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className={`animate-count text-3xl font-bold tabular-nums ${accent ? "text-rose-400" : ""}`} style={accent ? undefined : { color }}>
          {loading ? <span className="inline-block h-8 w-20 animate-pulse rounded bg-white/10" /> : error ? (
            <button type="button" onClick={onRetry} title={error} className="text-sm font-medium text-rose-300 hover:text-rose-200">
              — <span className="text-[10px] underline underline-offset-2">retry</span>
            </button>
          ) : value}
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
