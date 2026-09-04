import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ScopeBanner } from "@/components/ScopeBanner";
import { TargetDetailClient } from "@/components/TargetDetailClient";

export default async function TargetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: target } = await supabase
    .from("targets")
    .select("*")
    .eq("id", id)
    .single();

  if (!target) notFound();

  const { data: hosts } = await supabase
    .from("hosts")
    .select("*")
    .eq("target_id", id)
    .order("created_at", { ascending: true });

  const { data: findings } = await supabase
    .from("findings")
    .select("*")
    .eq("target_id", id)
    .order("created_at", { ascending: false });

  const { data: subdomains } = await supabase
    .from("subdomains")
    .select("*")
    .eq("target_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
      </div>

      <ScopeBanner scope={target.scope} />

      <TargetDetailClient
        target={target}
        hosts={hosts ?? []}
        findings={findings ?? []}
        subdomains={subdomains ?? []}
      />
    </div>
  );
}
