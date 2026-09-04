import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";

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

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_email", user.email ?? "")
    .eq("read", false);

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Cyber Recon</h1>
          <p className="mt-0.5 text-xs text-muted">
            Authorized systems only — do not test out-of-scope targets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationBell userEmail={user.email ?? ""} />
          <div className="hidden items-center gap-1.5 rounded-md border border-white/5 bg-surface px-2.5 py-1.5 text-xs text-muted sm:flex">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {user.email}
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-white/5 px-3 py-1.5 text-xs text-muted transition-colors hover:border-white/10 hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <DashboardClient
        targets={targets ?? []}
        hosts={hosts ?? []}
        findings={findings ?? []}
        activities={activities ?? []}
        userName={user.email ?? "operator"}
      />
    </div>
  );
}
