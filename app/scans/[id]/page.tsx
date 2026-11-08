import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScanHistoryClient } from "@/components/ScanHistoryClient";

export default async function ScanHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("get_scan_history", { p_scan_id: id });
  if (error) return <div className="mx-auto max-w-[1000px] px-4 py-8"><Link href="/" className="text-xs text-muted hover:text-foreground">← Dashboard</Link><div className="mt-6 rounded-xl border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-300">Could not load scan history: {error.message}. Apply migration 20261108001300_scan_observability_permissions.sql.</div></div>;
  const scan = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!scan) notFound();
  return <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5 px-4 py-6 sm:px-6"><Link href="/" className="text-xs text-muted hover:text-foreground">← Dashboard</Link><ScanHistoryClient scan={scan} /></div>;
}
