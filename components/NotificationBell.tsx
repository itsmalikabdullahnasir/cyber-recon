"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Notification } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

// Derive a status glyph from the notification title the worker writes.
export function notifIcon(title: string): { icon: string; tint: string } {
  if (title.includes("✅") || /complete|finished|done/i.test(title)) return { icon: "✅", tint: "text-emerald-400" };
  if (title.includes("❌") || /fail|error/i.test(title)) return { icon: "❌", tint: "text-rose-400" };
  if (title.includes("🛰️") || /start|running|queued/i.test(title)) return { icon: "🛰️", tint: "text-amber-400" };
  return { icon: "🔔", tint: "text-accent" };
}

export function cleanTitle(title: string): string {
  return title.replace(/^[^\w]+/, "").trim() || title;
}

export function NotificationBell({ userEmail }: { userEmail: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("*")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data) setNotifications(data);
      });

    const channel = supabase
      .channel("notif-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_email=eq.${userEmail}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setNotifications((prev) => [payload.new as Notification, ...prev].slice(0, 50));
          } else if (payload.eventType === "UPDATE") {
            setNotifications((prev) => prev.map((n) => (n.id === (payload.new as Notification).id ? (payload.new as Notification) : n)));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userEmail]);

  async function markAllRead() {
    const supabase = createClient();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).eq("user_email", userEmail).eq("read", false);
  }

  async function markRead(id: string) {
    const supabase = createClient();
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-2 text-muted-dim transition-colors hover:bg-surface-hover hover:text-foreground"
        aria-label="Notifications"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="pulse-dot absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-[22rem] overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <span className="text-xs font-semibold">
                Notifications {unreadCount > 0 && <span className="ml-1 text-accent">({unreadCount})</span>}
              </span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-accent hover:text-accent-dim">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-12 text-center text-xs text-muted-dim">
                  <div className="mb-2 text-2xl opacity-20">🔔</div>
                  You&apos;re all caught up
                </div>
              ) : (
                notifications.slice(0, 15).map((n) => {
                  const { icon, tint } = notifIcon(n.title);
                  const body = (
                    <>
                      <span className={`mt-0.5 text-sm ${tint}`}>{icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {!n.read && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />}
                          <span className="truncate text-xs font-medium">{cleanTitle(n.title)}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{n.message}</p>
                        <span className="text-[10px] text-muted-dim/60">{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                    </>
                  );
                  const cls = `flex w-full items-start gap-2.5 border-b border-white/[0.03] px-4 py-2.5 text-left transition-colors hover:bg-surface-hover ${!n.read ? "bg-accent/[0.04]" : ""}`;
                  return n.target_id ? (
                    <Link key={n.id} href={`/targets/${n.target_id}`} onClick={() => markRead(n.id)} className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <button key={n.id} onClick={() => markRead(n.id)} className={cls}>
                      {body}
                    </button>
                  );
                })
              )}
            </div>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-white/5 px-4 py-2.5 text-center text-[11px] font-medium text-accent transition-colors hover:bg-surface-hover"
            >
              View all notifications →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export async function createNotification(userEmail: string, title: string, message: string, targetId?: string) {
  const supabase = createClient();
  await supabase.from("notifications").insert({
    user_email: userEmail,
    title,
    message,
    target_id: targetId || null,
    read: false,
  });
}
