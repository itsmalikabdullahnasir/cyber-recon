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

  const { data: targets } = await supabase
    .from("targets")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: hosts } = await supabase.from("hosts").select("*");

  const { data: findings } = await supabase
    .from("findings")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: activities } = await supabase
    .from("activities")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: scans } = await supabase
    .from("scans")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);

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
          userName={user.email ?? "operator"}
        />
      </div>
    </>
  );
}
