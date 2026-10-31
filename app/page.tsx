import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { TopNav } from "@/components/TopNav";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: targets }, { count: targetCount }, { count: hostCount }, { count: findingCount }, { count: liveHostCount }, { count: criticalFindingCount }, { count: highFindingCount }, { count: scanCount }, { count: activeScanCount }, { count: criticalCount }, { count: highCount }, { count: mediumCount }, { count: lowCount }, { count: infoCount }] =
    await Promise.all([
      supabase
    .from("targets")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, 199),
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
    ]);

  const { data: hosts } = await supabase.from("hosts").select("*").range(0, 199);

  const { data: findings } = await supabase
    .from("findings")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, 199);

  const { data: activities } = await supabase
    .from("activities")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: scans } = await supabase
    .from("scans")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, 39);

  return (
    <>
      <TopNav userEmail={user.email ?? ""} />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6">
        <DashboardClient
          targets={targets ?? []}
          hosts={hosts ?? []}
          findings={findings ?? []}
          activities={activities ?? []}
          scans={scans ?? []}
          totals={{
            targets: targetCount ?? 0,
            hosts: hostCount ?? 0,
            liveHosts: liveHostCount ?? 0,
            findings: findingCount ?? 0,
            criticalFindings: (criticalFindingCount ?? 0) + (highFindingCount ?? 0),
            scans: scanCount ?? 0,
            activeScans: activeScanCount ?? 0,
            severity: { Critical: criticalCount ?? 0, High: highCount ?? 0, Medium: mediumCount ?? 0, Low: lowCount ?? 0, Info: infoCount ?? 0 },
          }}
          userName={user.email ?? "operator"}
        />
      </div>
    </>
  );
}
