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

  const { data: { user } } = await supabase.auth.getUser();
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

  const { data: findings } = await supabase
    .from("findings")
    .select("*")
    .eq("host_id", hostId)
    .order("created_at", { ascending: false });

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

      <HostDetailClient host={host} findings={findings ?? []} />
    </div>
  );
}
