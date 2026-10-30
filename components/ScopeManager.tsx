"use client";

import { useState } from "react";
import type { ScopeEntry, ScopeKind } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

const KIND_HELP: Record<ScopeKind, string> = {
  domain: "exact hostname, e.g. app.example.com",
  wildcard: "all subdomains, e.g. *.example.com",
  ip: "single IP, e.g. 203.0.113.10",
  cidr: "network, e.g. 203.0.113.0/24",
};

const KIND_BADGE: Record<ScopeKind, string> = {
  domain: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
  wildcard: "border-violet-500/20 bg-violet-500/10 text-violet-400",
  ip: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  cidr: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
};

export function ScopeManager({
  targetId,
  entries,
}: {
  targetId: string;
  entries: ScopeEntry[];
}) {
  const [kind, setKind] = useState<ScopeKind>("wildcard");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim().toLowerCase();
    if (!v) {
      setError("Value is required");
      return;
    }
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("scope_entries")
      .insert({ target_id: targetId, kind, value: v, note: note.trim() || null });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setValue("");
    setNote("");
    window.location.reload();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("scope_entries").delete().eq("id", id);
    window.location.reload();
  }

  return (
    <div className="rounded-xl border border-white/5 bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Authorized scope</h3>
          <p className="text-[11px] text-muted-dim">
            Active scans (nmap, nuclei) run only against entries listed here. Passive recon is always allowed.
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-400">
          No scope entries yet — only passive scans can run. Add what you are authorized to actively test.
        </p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1.5">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs"
            >
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${KIND_BADGE[e.kind]}`}>
                {e.kind}
              </span>
              <span className="font-mono">{e.value}</span>
              {e.note && <span className="text-muted-dim">— {e.note}</span>}
              <button
                onClick={() => remove(e.id)}
                className="ml-auto text-muted-dim transition-colors hover:text-danger"
                aria-label="Remove scope entry"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-dim">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ScopeKind)}
            className="rounded-lg border border-white/10 bg-background px-2 py-1.5 text-xs"
          >
            <option value="domain">domain</option>
            <option value="wildcard">wildcard</option>
            <option value="ip">ip</option>
            <option value="cidr">cidr</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-dim">Value</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={KIND_HELP[kind]}
            className="w-full rounded-lg border border-white/10 bg-background px-2 py-1.5 font-mono text-xs"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-dim">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="authorization ref"
            className="w-full rounded-lg border border-white/10 bg-background px-2 py-1.5 text-xs"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-accent/30 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
