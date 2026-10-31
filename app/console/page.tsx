import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ConsoleClient } from "@/components/ConsoleClient";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Find or create the single console target (its scope entries = allowlist).
  let { data: target } = await supabase
    .from("targets")
    .select("id")
    .eq("is_console", true)
    .maybeSingle();

  if (!target) {
    const { data: created } = await supabase
      .from("targets")
      .insert({
        name: "Scan Console",
        category: "Console",
        scope: "In Scope",
        status: "Recon",
        is_console: true,
        description:
          "Ad-hoc scans launched from the Scan Console. Scope entries here are the active-scan allowlist.",
      })
      .select("id")
      .single();
    target = created ?? null;
    if (!target) {
      // Someone created it concurrently — re-read.
      const { data: again } = await supabase.from("targets").select("id").eq("is_console", true).maybeSingle();
      target = again ?? null;
    }
  }

  if (!target) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/8 p-4 text-sm text-rose-300">
          Could not initialize the Scan Console. Make sure the migration{" "}
          <code>20261030000100_console_and_tools.sql</code> has been applied.
        </p>
      </div>
    );
  }

  const id = target.id;
  const [{ data: scopeEntries }, { data: scans }, { data: subdomains }, { data: hosts }, { data: findings }, { data: groups }, { data: members }] =
    await Promise.all([
      supabase.from("scope_entries").select("*").eq("target_id", id).order("created_at", { ascending: true }),
      supabase.from("scans").select("*").eq("target_id", id).order("created_at", { ascending: false }).limit(25),
      supabase.from("subdomains").select("*").eq("target_id", id).order("created_at", { ascending: false }),
      supabase.from("hosts").select("*").eq("target_id", id),
      supabase.from("findings").select("*").eq("target_id", id).order("created_at", { ascending: false }),
      supabase.from("targets").select("id, name, category, is_console").order("created_at", { ascending: false }),
      supabase.from("engagement_group_members").select("*").eq("group_id", id).order("created_at", { ascending: false }),
    ]);

  return (
    <>
      <TopNav userEmail={user.email ?? ""} />
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-surface p-6">
          <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
          <div className="relative">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <span>🛰️</span> Scan <span className="gradient-text">Console</span>
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-muted">
              Point the recon VM at any IP or domain — one or many. Active scans (nmap, dir brute, nuclei) run only against
              the allowlist below. Authorized systems only.
            </p>
          </div>
        </div>

        <ConsoleClient
          consoleTargetId={id}
          userEmail={user.email ?? ""}
          groups={groups ?? []}
          scopeEntries={scopeEntries ?? []}
          initialScans={scans ?? []}
          subdomains={subdomains ?? []}
          hosts={hosts ?? []}
          findings={findings ?? []}
          members={members ?? []}
        />
      </div>
    </>
  );
}
