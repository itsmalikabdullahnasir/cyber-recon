import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currentRole = (user.app_metadata?.role as string) || "operator";

  const { data: logs, error } = await supabase
    .from("audit_logs")
    .select("id, actor_email, action, target_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <TopNav userEmail={user.email ?? ""} />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Security Audit &amp; <span className="gradient-text">Role Management</span>
          </h1>
          <p className="mt-1 text-xs text-muted">
            Tamper-evident audit trail for scan executions, finding lifecycle changes, and RBAC policies.
          </p>
        </div>

        {/* Role & Permissions Card */}
        <section className="rounded-xl border border-white/5 bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
                Role-Based Access Control (RBAC)
              </p>
              <h2 className="mt-0.5 text-sm font-semibold">Active Session Privileges</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-dim">Your Assigned Role:</span>
              <span className="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-xs font-bold text-accent capitalize">
                {currentRole}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-lg border border-white/5 bg-background/20 p-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-400">Admin</span>
                <span className="text-[10px] text-muted-dim">Full Tenant Scope</span>
              </div>
              <p className="mt-1.5 text-muted text-[11px] leading-relaxed">
                Full access to all scans, findings, targets, logs, and queue controls across the entire team.
              </p>
            </div>

            <div className="rounded-lg border border-white/5 bg-background/20 p-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-400">Analyst</span>
                <span className="text-[10px] text-muted-dim">Vulnerability Triage</span>
              </div>
              <p className="mt-1.5 text-muted text-[11px] leading-relaxed">
                Triage findings, post investigation comments, assign issues, and set SLA deadlines.
              </p>
            </div>

            <div className="rounded-lg border border-white/5 bg-background/20 p-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-muted">Operator</span>
                <span className="text-[10px] text-muted-dim">User-Scoped (Default)</span>
              </div>
              <p className="mt-1.5 text-muted text-[11px] leading-relaxed">
                Strictly scoped to user-owned scans and findings via Row Level Security (RLS).
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-white/5 bg-black/40 p-3 text-[11px] font-mono text-muted">
            <span className="font-sans font-semibold text-foreground">Granting Team Roles in Supabase SQL:</span>
            <pre className="mt-1 text-accent">
{`-- Grant role to a team member via Supabase Auth app_metadata:
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where email = 'analyst@yourcompany.com';`}
            </pre>
          </div>
        </section>

        {/* Audit Log Table */}
        <section className="card p-5">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div>
              <h2 className="text-sm font-semibold">Audit Event Log</h2>
              <p className="text-[11px] text-muted-dim">
                Real-time security events captured across scans, lifecycle updates, comments, and SLAs
              </p>
            </div>
            <span className="font-mono text-xs text-muted-dim">{logs?.length ?? 0} events logged</span>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/8 p-4 text-sm text-rose-300">
              Could not load audit logs: {error.message}
            </div>
          ) : !logs?.length ? (
            <div className="mt-4 rounded-xl border border-white/5 bg-surface p-8 text-center text-sm text-muted">
              No audit events yet. Actions performed by team members will be indexed here.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-white/5 bg-surface">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/5 text-[10px] uppercase tracking-widest text-muted-dim bg-background/30">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Actor Email</th>
                    <th className="px-4 py-3">Metadata &amp; Context</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-white/[0.03] hover:bg-white/[0.01]">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-muted-dim">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{log.actor_email ?? "—"}</td>
                      <td className="max-w-[480px] truncate px-4 py-3 font-mono text-[10px] text-muted-dim">
                        {JSON.stringify(log.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
