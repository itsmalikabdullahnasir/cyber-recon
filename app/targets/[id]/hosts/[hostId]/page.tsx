import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { HostDetailClient } from "@/components/HostDetailClient";

export default async function HostDetailPage({
  params,
}: {
  params: Promise<{ id: string; hostId: string }>;
}) {
  const { id, hostId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: host } = await supabase
    .from("hosts")
    .select("*")
    .eq("id", hostId)
    .eq("target_id", id)
    .single();

  if (!host) notFound();

  const { data: target } = await supabase
    .from("targets")
    .select("*")
    .eq("id", id)
    .single();

  const [{ data: findings }, { data: hostHistory }, { data: subdomains }, { data: scans }] =
    await Promise.all([
      supabase
        .from("findings")
        .select("*")
        .eq("host_id", hostId)
        .order("created_at", { ascending: false }),
      supabase
        .from("host_history")
        .select("*")
        .eq("host_id", hostId)
        .order("captured_at", { ascending: false })
        .limit(50),
      supabase
        .from("subdomains")
        .select("*")
        .eq("target_id", id)
        .limit(100),
      supabase
        .from("scans")
        .select("*")
        .eq("target_id", id)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-8">
      <div>
        <Link
          href={`/targets/${id}`}
          className="text-xs text-muted hover:text-foreground"
        >
          ← Back to {target?.name ?? "target"}
        </Link>
      </div>

      <HostDetailClient
        host={host}
        target={target ?? undefined}
        findings={findings ?? []}
        history={hostHistory ?? []}
        subdomains={subdomains ?? []}
        scans={scans ?? []}
      />
    </div>
  );
}
