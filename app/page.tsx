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

  const { data, error } = await supabase.rpc("get_dashboard_data");
  if (error) {
    throw new Error(`Could not load dashboard data: ${error.message}`);
  }
  if (!data) {
    throw new Error("Could not load dashboard data: the database returned no data");
  }

  const dashboard = data as DashboardData;

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
            targets: null,
            hosts: null,
            liveHosts: null,
            findings: null,
            criticalFindings: null,
            scans: null,
            activeScans: null,
            severity: {
              Critical: null,
              High: null,
              Medium: null,
              Low: null,
              Info: null,
            },
          }}
          runningScan={dashboard.running_scan}
          runningScanError={null}
          userName={user.email ?? "operator"}
        />
      </div>
    </>
  );
}
