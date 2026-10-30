import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NotificationsClient } from "@/components/NotificationsClient";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_email", user.email ?? "")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <TopNav userEmail={user.email ?? ""} />
      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">🔔 Notifications</h1>
          <p className="mt-0.5 text-xs text-muted">Live updates from your recon VM — one per scan, as each target finishes.</p>
        </div>
        <NotificationsClient userEmail={user.email ?? ""} initial={notifications ?? []} />
      </div>
    </>
  );
}
