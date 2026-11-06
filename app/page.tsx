import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { TopNav } from "@/components/TopNav";
import type { Activity, Finding, Host, Scan, Target } from "@/lib/types";

type DashboardData = {
  targets: Target[];
  hosts: Host[];
  findings: Finding[];
  activities: Activity[];
  scans: Scan[];
  running_scan: Scan | null;
  scan_series: number[];
  totals: {
    targets: number;
    hosts: number;
    live_hosts: number;
    findings: number;
    critical_findings: number;
    scans: number;
    active_scans: number;
    severity: Record<string, number>;
  };
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rpcData } = await supabase.rpc("get_dashboard_data");
  if (rpcData) {
    const dashboard = rpcData as DashboardData;
    return (
      <>
        <TopNav userEmail={user.email ?? ""} />
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6">
          <DashboardClient
            targets={dashboard.targets}
            hosts={dashboard.hosts}
            findings={dashboard.findings}
            activities={dashboard.activities}
            scans={dashboard.scans}
            totals={{
              targets: dashboard.totals.targets,
              hosts: dashboard.totals.hosts,
              liveHosts: dashboard.totals.live_hosts,
              findings: dashboard.totals.findings,
              criticalFindings: dashboard.totals.critical_findings,
              scans: dashboard.totals.scans,
              activeScans: dashboard.totals.active_scans,
              severity: dashboard.totals.severity,
            }}
            countErrors={{
              targets: null, hosts: null, liveHosts: null, findings: null,
              criticalFindings: null, scans: null, activeScans: null,
              severity: { Critical: null, High: null, Medium: null, Low: null, Info: null },
            }}
            runningScan={dashboard.running_scan}
            runningScanError={null}
            scanSeries={dashboard.scan_series}
            userName={user.email ?? "operator"}
          />
        </div>
      </>
    );
  }

  const [
    { data: targets },
    targetCountResult,
    hostCountResult,
    findingCountResult,
    liveHostCountResult,
    criticalFindingCountResult,
    highFindingCountResult,
    scanCountResult,
    activeScanCountResult,
    criticalCountResult,
    highCountResult,
    mediumCountResult,
    lowCountResult,
    infoCountResult,
    runningScanResult,
    hostsResult,
    findingsResult,
    activitiesResult,
    scansResult,
    scanActivityResult,
  ] = await Promise.all([
    supabase.from("targets").select("*").order("created_at", { ascending: false }).range(0, 199),
    supabase.from("targets").select("id", { count: "exact", head: true }).eq("is_console", false),
    supabase.from("hosts").select("id", { count: "exact", head: true }),
    supabase.from("findings").select("id", { count: "exact", head: true }),
    supabase.from("hosts").select("id", { count: "exact", head: true }).eq("status", "Live"),
    supabase.from("findings").select("id", { count: "exact", head: true }).eq("severity", "Critical"),
    supabase.from("findings").select("id", { count: "exact", head: true }).eq("severity", "High"),
    supabase.from("scans").select("id", { count: "exact", head: true }),
    supabase.from("scans").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
    supabase.from("findings").select("id", { count: "exact", head: true }).eq("severity", "Critical"),
    supabase.from("findings").select("id", { count: "exact", head: true }).eq("severity", "High"),
    supabase.from("findings").select("id", { count: "exact", head: true }).eq("severity", "Medium"),
    supabase.from("findings").select("id", { count: "exact", head: true }).eq("severity", "Low"),
    supabase.from("findings").select("id", { count: "exact", head: true }).eq("severity", "Info"),
    supabase.from("scans").select("*").eq("status", "running").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("hosts").select("*").range(0, 199),
    supabase.from("findings").select("*").order("created_at", { ascending: false }).range(0, 199),
    supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("scans").select("*").order("created_at", { ascending: false }).range(0, 39),
    // Server-side time bounds keep this fallback query small when the RPC
    // migration has not been applied yet.
    // eslint-disable-next-line react-hooks/purity
    supabase.from("scans").select("created_at").gte("created_at", new Date(Date.now() - 23 * 3600000).toISOString()),
  ]);

  const scanSeries = new Array(24).fill(0);
  // The server-rendered fallback is only used when the RPC migration is absent.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  for (const scan of scanActivityResult.data ?? []) {
    const age = Math.floor((now - new Date(scan.created_at).getTime()) / 3600000);
    if (age >= 0 && age < 24) scanSeries[23 - age]++;
  }

  return (
    <>
      <TopNav userEmail={user.email ?? ""} />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6">
        <DashboardClient
          targets={targets ?? []}
          hosts={hostsResult.data ?? []}
          findings={findingsResult.data ?? []}
          activities={activitiesResult.data ?? []}
          scans={scansResult.data ?? []}
          totals={{
            targets: targetCountResult.count,
            hosts: hostCountResult.count,
            liveHosts: liveHostCountResult.count,
            findings: findingCountResult.count,
            criticalFindings: criticalFindingCountResult.error || highFindingCountResult.error
              ? null
              : (criticalFindingCountResult.count ?? 0) + (highFindingCountResult.count ?? 0),
            scans: scanCountResult.count,
            activeScans: activeScanCountResult.count,
            severity: {
              Critical: criticalCountResult.count,
              High: highCountResult.count,
              Medium: mediumCountResult.count,
              Low: lowCountResult.count,
              Info: infoCountResult.count,
            },
          }}
          countErrors={{
            targets: targetCountResult.error?.message ?? null,
            hosts: hostCountResult.error?.message ?? null,
            liveHosts: liveHostCountResult.error?.message ?? null,
            findings: findingCountResult.error?.message ?? null,
            criticalFindings: criticalFindingCountResult.error?.message ?? highFindingCountResult.error?.message ?? null,
            scans: scanCountResult.error?.message ?? null,
            activeScans: activeScanCountResult.error?.message ?? null,
            severity: {
              Critical: criticalCountResult.error?.message ?? null,
              High: highCountResult.error?.message ?? null,
              Medium: mediumCountResult.error?.message ?? null,
              Low: lowCountResult.error?.message ?? null,
              Info: infoCountResult.error?.message ?? null,
            },
          }}
          runningScan={runningScanResult.data}
          runningScanError={runningScanResult.error?.message ?? null}
          scanSeries={scanSeries}
          userName={user.email ?? "operator"}
        />
      </div>
    </>
  );
}
