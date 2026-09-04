import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/StatCard";
import { TargetCard } from "@/components/TargetCard";
import { EmptyState } from "@/components/EmptyState";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: targets } = await supabase
    .from("targets")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: hosts } = await supabase
    .from("hosts")
    .select("*");

  const { count: findingsCount } = await supabase
    .from("findings")
    .select("*", { count: "exact", head: true });

  const allHosts = hosts ?? [];
  const highRisk = allHosts.filter(
    (h) => h.exploitability === "High" || h.exploitability === "Critical"
  ).length;

  const categories = [...new Set((targets ?? []).map((t) => t.category))];

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted">
            Authorized systems only — do not add out-of-scope targets
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Targets" value={targets?.length ?? 0} />
        <StatCard label="Hosts" value={allHosts.length} />
        <StatCard label="High risk" value={highRisk} accent={highRisk > 0} />
        <StatCard label="Findings" value={findingsCount ?? 0} />
      </div>

      <DashboardClient
        targets={targets ?? []}
        hosts={allHosts}
        categories={categories}
      />
    </div>
  );
}
