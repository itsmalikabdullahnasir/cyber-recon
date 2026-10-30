"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// A compact, always-on scan progress pill shown in the nav on every page.
// It tracks a rolling "batch" of scans: once scans go active it counts how
// many of that batch have finished, and briefly shows a done summary when the
// batch clears. State is driven entirely by Supabase Realtime, so it stays
// correct no matter which page you're on.
export function ScanProgress() {
  const statusById = useRef<Map<string, string>>(new Map());
  const batch = useRef<Set<string>>(new Set());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [completed, setCompleted] = useState<number | null>(null);
  const [counts, setCounts] = useState<{ active: number; total: number }>({ active: 0, total: 0 });

  useEffect(() => {
    const supabase = createClient();

    function recompute() {
      const ids = [...batch.current];
      const active = ids.filter((id) => {
        const s = statusById.current.get(id);
        return s === "queued" || s === "running";
      }).length;
      setCounts({ active, total: ids.length });
      if (active === 0 && ids.length > 0 && !clearTimer.current) {
        setCompleted(ids.length);
        clearTimer.current = setTimeout(() => {
          batch.current.clear();
          setCompleted(null);
          clearTimer.current = null;
          setCounts({ active: 0, total: 0 });
        }, 6000);
      } else if (active > 0 && clearTimer.current) {
        clearTimeout(clearTimer.current);
        clearTimer.current = null;
        setCompleted(null);
      }
    }

    // Seed with any scans already in flight when this page loaded.
    supabase
      .from("scans")
      .select("id, status")
      .in("status", ["queued", "running"])
      .then(({ data }) => {
        for (const row of data ?? []) {
          statusById.current.set(row.id, row.status);
          batch.current.add(row.id);
        }
        recompute();
      });

    const channel = supabase
      .channel("scan-progress")
      .on("postgres_changes", { event: "*", schema: "public", table: "scans" }, (payload) => {
        const row = payload.new as { id?: string; status?: string };
        if (!row?.id || !row.status) return;
        statusById.current.set(row.id, row.status);
        if (row.status === "queued" || row.status === "running") batch.current.add(row.id);
        recompute();
      })
      .subscribe();

    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const { active, total } = counts;
  const done = total - active;

  if (active > 0) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <Link
        href="/console"
        title={`${done} of ${total} scans done`}
        className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5"
      >
        <svg className="h-3.5 w-3.5 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-90" d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="text-[11px] font-medium text-amber-300">
          {done}/{total}
        </span>
        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-amber-500/20 sm:block">
          <span className="block h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </span>
      </Link>
    );
  }

  if (completed !== null) {
    return (
      <Link
        href="/console"
        className="animate-fade-in flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300"
      >
        ✓ {completed} done
      </Link>
    );
  }

  return null;
}
