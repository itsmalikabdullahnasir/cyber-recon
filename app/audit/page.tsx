import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: logs, error } = await supabase
    .from("audit_logs")
    .select("id, actor_email, action, target_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <TopNav userEmail={user.email ?? ""} />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit <span className="gradient-text">Log</span></h1>
          <p className="mt-1 text-xs text-muted">Recent group, import, and scan actions.</p>
        </div>
        {error ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 p-4 text-sm text-rose-300">
            Could not load audit logs: {error.message}
          </div>
        ) : !logs?.length ? (
          <div className="rounded-xl border border-white/5 bg-surface p-8 text-center text-sm text-muted">
            No audit events yet. Create a group, import members, or launch a scan to record one.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/5 bg-surface">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/5 text-[10px] uppercase tracking-widest text-muted-dim">
                <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Details</th></tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-white/[0.03] last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-dim">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-accent">{log.action}</td>
                    <td className="px-4 py-3 text-muted">{log.actor_email ?? "—"}</td>
                    <td className="max-w-[520px] truncate px-4 py-3 font-mono text-[10px] text-muted-dim">{JSON.stringify(log.metadata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
