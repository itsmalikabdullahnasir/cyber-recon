"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Notification } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { notifIcon, cleanTitle } from "@/components/NotificationBell";

export function NotificationsClient({
  userEmail,
  initial,
}: {
  userEmail: string;
  initial: Notification[];
}) {
  const [items, setItems] = useState<Notification[]>(initial);
  const [tab, setTab] = useState<"all" | "unread">("all");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notif-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_email=eq.${userEmail}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setItems((prev) => [payload.new as Notification, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setItems((prev) => prev.map((n) => (n.id === (payload.new as Notification).id ? (payload.new as Notification) : n)));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userEmail]);

  const unread = items.filter((n) => !n.read).length;
  const shown = tab === "unread" ? items.filter((n) => !n.read) : items;

  // Group by calendar day for a tidy timeline.
  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of shown) {
      const key = dayLabel(n.created_at);
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return Array.from(map.entries());
  }, [shown]);

  async function markAllRead() {
    const supabase = createClient();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).eq("user_email", userEmail).eq("read", false);
  }

  async function markRead(id: string) {
    const supabase = createClient();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
          <button
            onClick={() => setTab("all")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${tab === "all" ? "bg-accent/20 text-accent" : "text-muted-dim hover:text-foreground"}`}
          >
            All {items.length > 0 && <span className="text-muted-dim">({items.length})</span>}
          </button>
          <button
            onClick={() => setTab("unread")}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${tab === "unread" ? "bg-accent/20 text-accent" : "text-muted-dim hover:text-foreground"}`}
          >
            Unread {unread > 0 && <span className="text-accent">({unread})</span>}
          </button>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground">
            Mark all read
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="card flex flex-col items-center justify-center px-8 py-20 text-center">
          <div className="mb-3 text-4xl opacity-20">🔔</div>
          <p className="text-sm text-muted">{tab === "unread" ? "No unread notifications" : "No notifications yet"}</p>
          <p className="mt-1 text-xs text-muted-dim">Scan updates from the recon VM will appear here.</p>
        </div>
      ) : (
        groups.map(([day, list]) => (
          <div key={day} className="flex flex-col gap-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-dim">{day}</p>
            {list.map((n) => {
              const { icon, tint } = notifIcon(n.title);
              const inner = (
                <>
                  <span className={`mt-0.5 text-lg ${tint}`}>{icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />}
                      <span className="text-sm font-medium">{cleanTitle(n.title)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{n.message}</p>
                    <span className="mt-1 block font-mono text-[10px] text-muted-dim">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  {n.target_id && <span className="self-center text-xs text-muted-dim">→</span>}
                </>
              );
              const cls = `card card-hover flex items-start gap-3 p-4 ${!n.read ? "border-accent/20" : ""}`;
              return n.target_id ? (
                <Link key={n.id} href={`/targets/${n.target_id}`} onClick={() => markRead(n.id)} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button key={n.id} onClick={() => markRead(n.id)} className={`${cls} text-left`}>
                  {inner}
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}
