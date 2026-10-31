"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type QueueCounts = { queued: number; running: number; done: number; failed: number };

export function ScanProgress() {
  const [counts, setCounts] = useState<QueueCounts>({ queued: 0, running: 0, done: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    const refresh = async () => {
      const results = await Promise.all(["queued", "running", "done", "failed"].map((status) =>
        supabase.from("scans").select("id", { count: "exact", head: true }).eq("status", status),
      ));
      const queryError = results.find((result) => result.error)?.error?.message ?? null;
      if (queryError) {
        setError(queryError);
        setLoading(false);
        return;
      }
      setCounts({
        queued: results[0].count ?? 0,
        running: results[1].count ?? 0,
        done: results[2].count ?? 0,
        failed: results[3].count ?? 0,
      });
      setError(null);
      setLoading(false);
    };
    const schedule = () => {
      pending.current = true;
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (pending.current) {
          pending.current = false;
          void refresh();
        }
      }, 1500);
    };
    void refresh();
    const channel = supabase
      .channel("scan-progress")
      .on("postgres_changes", { event: "*", schema: "public", table: "scans" }, schedule)
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return <span className="h-7 w-24 animate-pulse rounded-lg bg-white/10" title="Loading queue status" />;
  }
  if (error) {
    return (
      <button
        type="button"
        title={error}
        onClick={() => {
          if (timer.current) return;
          pending.current = false;
          setLoading(true);
          const supabase = createClient();
          void Promise.all(["queued", "running", "done", "failed"].map((status) =>
            supabase.from("scans").select("id", { count: "exact", head: true }).eq("status", status),
          )).then((results) => {
            const queryError = results.find((result) => result.error)?.error?.message ?? null;
            setError(queryError);
            if (!queryError) {
              setCounts({
                queued: results[0].count ?? 0,
                running: results[1].count ?? 0,
                done: results[2].count ?? 0,
                failed: results[3].count ?? 0,
              });
            }
            setLoading(false);
          });
        }}
        className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-300"
      >
        Queue unavailable · retry
      </button>
    );
  }
  const active = counts.queued + counts.running;
  const total = active + counts.done + counts.failed;
  if (total === 0) return null;

  return (
    <Link
      href="/console"
      title={`${active.toLocaleString()} queued or running; ${counts.done.toLocaleString()} done`}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
        active > 0 ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active > 0 ? "animate-pulse bg-amber-400" : "bg-emerald-400"}`} />
      <span className={`text-[11px] font-medium ${active > 0 ? "text-amber-300" : "text-emerald-300"}`}>
        Queue: {active.toLocaleString()} active
      </span>
    </Link>
  );
}
