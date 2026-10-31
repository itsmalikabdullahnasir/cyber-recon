"use client";

import { useEffect, useState } from "react";

type WorkerState = { ok: boolean; latencyMs?: number; error?: string };

export function WorkerStatus() {
  const [state, setState] = useState<WorkerState | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/api/worker-health", { cache: "no-store" });
        const data = (await response.json()) as WorkerState;
        if (active) setState(data);
      } catch {
        if (active) setState({ ok: false, error: "Health check failed" });
      }
    };
    void check();
    const timer = setInterval(check, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const label = state === null ? "Worker checking" : state.ok ? `Worker · ${state.latencyMs ?? "—"}ms` : "Worker offline";
  return (
    <span
      title={state?.error ?? (state?.latencyMs ? `${state.latencyMs}ms response` : label)}
      className={`hidden items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] sm:flex ${
        state?.ok ? "border-emerald-500/20 text-emerald-300" : state === null ? "border-white/10 text-muted-dim" : "border-rose-500/20 text-rose-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${state?.ok ? "bg-emerald-400" : state === null ? "bg-zinc-400" : "bg-rose-400"}`} />
      {label}
    </span>
  );
}
