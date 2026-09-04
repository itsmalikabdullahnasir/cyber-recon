"use client";

import { useState } from "react";
import type { Subdomain } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

export function SubdomainsTab({
  targetId,
  subdomains,
}: {
  targetId: string;
  subdomains: Subdomain[];
}) {
  const [adding, setAdding] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [discoveredBy, setDiscoveredBy] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"All" | "Active" | "Inactive" | "Unknown">("All");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Subdomain name is required"); return; }
    setError(null); setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("subdomains").insert({
      target_id: targetId,
      name: name.trim(),
      ip: ip.trim() || null,
      discovered_by: discoveredBy.trim() || null,
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setName(""); setIp(""); setDiscoveredBy(""); setAdding(false); setLoading(false);
    window.location.reload();
  }

  async function handleBulkAdd() {
    const lines = bulkInput.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { setError("Enter at least one subdomain"); return; }
    setError(null); setLoading(true);
    const supabase = createClient();
    const rows = lines.map((line) => {
      const parts = line.split(/[,\s]+/);
      return {
        target_id: targetId,
        name: parts[0],
        ip: parts[1] || null,
        discovered_by: discoveredBy.trim() || null,
      };
    });
    const { error } = await supabase.from("subdomains").insert(rows);
    if (error) { setError(error.message); setLoading(false); return; }
    setBulkInput(""); setBulkMode(false); setAdding(false); setLoading(false);
    window.location.reload();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const supabase = createClient();
    await supabase.from("subdomains").delete().eq("id", id);
    window.location.reload();
  }

  const filtered = filter === "All" ? subdomains : subdomains.filter((s) => s.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-medium text-muted-dim">
            {subdomains.length} subdomain{subdomains.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-1">
            {(["All", "Active", "Inactive", "Unknown"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded px-2 py-0.5 text-[10px] font-medium transition-all ${
                filter === f ? "bg-accent/10 text-accent" : "text-muted-dim hover:text-foreground"
              }`}>{f}</button>
            ))}
          </div>
        </div>
        {!adding && (
          <div className="flex gap-1.5">
            <button onClick={() => { setAdding(true); setBulkMode(false); }} className="rounded-md border border-accent/20 bg-accent/8 px-3 py-1.5 text-xs font-medium text-accent transition-all hover:border-accent/30 hover:bg-accent/15">
              + Add
            </button>
            <button onClick={() => { setAdding(true); setBulkMode(true); }} className="rounded-md border border-white/5 bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-all hover:border-white/10 hover:text-foreground">
              + Bulk add
            </button>
          </div>
        )}
      </div>

      {adding && !bulkMode && (
        <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded-xl border border-accent/15 bg-surface p-4 animate-fade-in">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="subdomain.example.com" autoFocus className="rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
            <input type="text" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP (optional)" className="rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
            <input type="text" value={discoveredBy} onChange={(e) => setDiscoveredBy(e.target.value)} placeholder="Discovered by" className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30" />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-1.5 text-xs font-semibold text-white hover:shadow-[0_0_16px_rgba(168,85,247,0.3)] disabled:opacity-50">
              {loading ? "Adding..." : "Add"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(null); }} className="rounded-lg border border-white/5 px-4 py-1.5 text-xs text-muted hover:text-foreground">Cancel</button>
          </div>
        </form>
      )}

      {adding && bulkMode && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent/15 bg-surface p-4 animate-fade-in">
          <p className="text-xs text-muted">One per line. Format: <code className="font-mono text-accent">subdomain IP</code> (IP optional)</p>
          <textarea value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} rows={8} placeholder={"www.example.com 192.168.1.1\nmail.example.com\ndev.example.com 10.0.0.5"} className="rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent/30" />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input type="text" value={discoveredBy} onChange={(e) => setDiscoveredBy(e.target.value)} placeholder="Discovered by" className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30 sm:w-48" />
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={handleBulkAdd} disabled={loading} className="rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-1.5 text-xs font-semibold text-white hover:shadow-[0_0_16px_rgba(168,85,247,0.3)] disabled:opacity-50">
              {loading ? "Adding..." : `Add all`}
            </button>
            <button onClick={() => { setAdding(false); setBulkMode(false); setError(null); }} className="rounded-lg border border-white/5 px-4 py-1.5 text-xs text-muted hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !adding && (
        <button onClick={() => setAdding(true)} className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/8 px-8 py-12 text-center transition-all hover:border-accent/15 hover:bg-surface-hover">
          <div className="mb-2 text-2xl opacity-20">🌐</div>
          <p className="text-sm font-medium text-muted">No subdomains discovered</p>
          <p className="mt-1 text-[11px] text-muted-dim">Add manually or paste from subfinder/amass</p>
        </button>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-col gap-1">
          {filtered.map((s) => (
            <div key={s.id} className="group flex items-center gap-4 rounded-lg border border-white/[0.03] px-4 py-2.5 transition-all hover:border-white/8 hover:bg-surface-hover">
              <span className={`h-2 w-2 rounded-full ${
                s.status === "Active" ? "bg-emerald-400" : s.status === "Inactive" ? "bg-rose-400" : "bg-zinc-400"
              }`} />
              <div className="min-w-0 flex-1">
                <span className="font-mono text-sm">{s.name}</span>
                {s.ip && <span className="ml-2 font-mono text-[11px] text-muted-dim">{s.ip}</span>}
              </div>
              {s.services && <span className="text-[11px] text-muted">{s.services}</span>}
              {s.discovered_by && <span className="text-[10px] text-muted-dim">by {s.discovered_by}</span>}
              <button onClick={() => handleDelete(s.id)} className="rounded p-1 text-muted-dim opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
