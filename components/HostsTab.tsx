"use client";

import { useState } from "react";
import Link from "next/link";
import type { Host, Likelihood, HostStatus } from "@/lib/types";
import { LIKELIHOOD_ORDER } from "@/lib/types";
import { StatusDot } from "@/components/StatusDot";
import { LikelihoodBadge } from "@/components/LikelihoodBadge";
import { createClient } from "@/lib/supabase/client";

interface ShodanResult {
  ip: string;
  hostname: string;
  os: string | null;
  country: string | null;
  city: string | null;
  isp: string | null;
  organization: string | null;
  ports: number[];
  services: { port: number; protocol: string; product: string; version: string; banner: string }[];
  vulnerabilities: string[];
}

export function HostsTab({
  targetId,
  hosts,
}: {
  targetId: string;
  hosts: Host[];
}) {
  const [adding, setAdding] = useState(false);
  const [ip, setIp] = useState("");
  const [hostStatus, setHostStatus] = useState<HostStatus>("Live");
  const [ports, setPorts] = useState("");
  const [services, setServices] = useState("");
  const [osGuess, setOsGuess] = useState("");
  const [exploitability, setExploitability] = useState<Likelihood>("Info");
  const [notes, setNotes] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shodanScanning, setShodanScanning] = useState(false);
  const [shodanResult, setShodanResult] = useState<ShodanResult | null>(null);

  function resetForm() {
    setIp(""); setHostStatus("Live"); setPorts(""); setServices("");
    setOsGuess(""); setExploitability("Info"); setNotes(""); setCheckedBy("");
    setShodanResult(null);
  }

  async function shodanScan() {
    if (!ip.trim()) { setError("Enter an IP first"); return; }
    setError(null); setShodanScanning(true); setShodanResult(null);
    try {
      const res = await fetch("/api/shodan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: ip.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Shodan scan failed"); setShodanScanning(false); return; }

      setShodanResult(data);
      setPorts(data.ports?.join(", ") || "");
      setServices(data.services?.map((s: { product: string; port: number }) => `${s.product || s.port}`).join(", ") || "");
      setOsGuess(data.os || "");
      setCheckedBy("shodan");
      setExploitability(data.vulnerabilities?.length > 3 ? "High" : data.vulnerabilities?.length > 0 ? "Medium" : "Info");
      setNotes([
        data.hostname && `hostname: ${data.hostname}`,
        data.isp && `ISP: ${data.isp}`,
        data.vulnerabilities?.length > 0 && `CVEs: ${data.vulnerabilities.join(", ")}`,
      ].filter(Boolean).join("\n"));
    } catch {
      setError("Shodan API error");
    }
    setShodanScanning(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!ip.trim()) { setError("IP address is required"); return; }
    setError(null); setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("hosts").insert({
      target_id: targetId, ip: ip.trim(), status: hostStatus,
      open_ports: ports.trim() || null, services: services.trim() || null,
      os_guess: osGuess.trim() || null, exploitability,
      notes: notes.trim() || null, checked_by: checkedBy.trim() || null,
      last_scanned: new Date().toISOString().split("T")[0],
    });
    if (error) { setError(error.message); setLoading(false); return; }
    resetForm(); setAdding(false); setLoading(false); window.location.reload();
  }

  async function handleDelete(hostId: string) {
    if (!confirm("Delete this host and all its findings?")) return;
    setDeletingId(hostId);
    const supabase = createClient();
    await supabase.from("hosts").delete().eq("id", hostId);
    window.location.reload();
  }

  const sortedHosts = [...hosts].sort(
    (a, b) => LIKELIHOOD_ORDER[b.exploitability] - LIKELIHOOD_ORDER[a.exploitability]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-dim">
          {hosts.length} host{hosts.length !== 1 ? "s" : ""}
        </p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="rounded-md border border-accent/20 bg-accent/8 px-3 py-1.5 text-xs font-medium text-accent transition-all hover:border-accent/30 hover:bg-accent/15 hover:shadow-[0_0_12px_rgba(168,85,247,0.15)]">
            + Add host
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-col gap-4 rounded-xl border border-accent/15 bg-surface p-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">New host</h3>
            <button type="button" onClick={() => { setAdding(false); resetForm(); }} className="text-muted-dim hover:text-foreground">✕</button>
          </div>

          {/* IP input + scan button */}
          <div className="flex flex-1 gap-2">
            <input type="text" value={ip} onChange={(e) => setIp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && shodanScan()} placeholder="IP address *" autoFocus className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none transition-all focus:border-accent/30 focus:shadow-[0_0_0_1px_rgba(168,85,247,0.1)]" />
            <button type="button" onClick={shodanScan} disabled={shodanScanning} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white transition-all hover:shadow-[0_0_16px_rgba(168,85,247,0.3)] disabled:opacity-50">
              {shodanScanning ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.3" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>
                  Scanning...
                </span>
              ) : "🔍 Scan"}
            </button>
          </div>

          {/* Inline Shodan preview */}
          {shodanScanning && (
            <div className="flex items-center gap-3 rounded-lg border border-accent/10 bg-accent/[0.03] px-4 py-6 animate-fade-in">
              <svg className="h-5 w-5 animate-spin text-accent" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.3" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>
              <span className="text-sm text-muted">Querying Shodan for <span className="font-mono text-accent">{ip.trim() || "..."}</span>...</span>
            </div>
          )}

          {shodanResult && !shodanScanning && (
            <div className="flex flex-col gap-3 rounded-lg border border-accent/10 bg-accent/[0.03] p-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-accent">Shodan Results</span>
                <span className="text-[10px] text-muted-dim">Auto-filled below</span>
              </div>

              {/* Quick stats row */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="rounded-md bg-background/50 px-3 py-2">
                  <p className="text-[9px] uppercase text-muted-dim">OS</p>
                  <p className="text-xs font-medium">{shodanResult.os || "—"}</p>
                </div>
                <div className="rounded-md bg-background/50 px-3 py-2">
                  <p className="text-[9px] uppercase text-muted-dim">Host</p>
                  <p className="text-xs font-medium truncate">{shodanResult.hostname || "—"}</p>
                </div>
                <div className="rounded-md bg-background/50 px-3 py-2">
                  <p className="text-[9px] uppercase text-muted-dim">Location</p>
                  <p className="text-xs font-medium">{shodanResult.city && shodanResult.country ? `${shodanResult.city}, ${shodanResult.country}` : shodanResult.country || "—"}</p>
                </div>
                <div className="rounded-md bg-background/50 px-3 py-2">
                  <p className="text-[9px] uppercase text-muted-dim">ISP</p>
                  <p className="text-xs font-medium truncate">{shodanResult.isp || "—"}</p>
                </div>
                <div className="rounded-md bg-background/50 px-3 py-2">
                  <p className="text-[9px] uppercase text-muted-dim">Open Ports</p>
                  <p className="text-xs font-mono font-medium text-accent">{shodanResult.ports.length}</p>
                </div>
              </div>

              {/* Services list */}
              {shodanResult.services.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase text-muted-dim mb-1.5">Services</p>
                  <div className="flex flex-wrap gap-1">
                    {shodanResult.services.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-background/50 px-2 py-1 text-[11px]">
                        <span className="font-mono font-medium text-accent">{s.port}</span>
                        <span className="text-muted-dim">/</span>
                        <span>{s.product || "unknown"}</span>
                        {s.version && <span className="text-muted-dim">{s.version}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Vulnerabilities */}
              {shodanResult.vulnerabilities.length > 0 && (
                <div>
                  <p className="text-[9px] uppercase text-muted-dim mb-1.5">Vulnerabilities</p>
                  <div className="flex flex-wrap gap-1">
                    {shodanResult.vulnerabilities.slice(0, 10).map((v, i) => (
                      <span key={i} className="rounded-md border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] text-rose-400">
                        {v}
                      </span>
                    ))}
                    {shodanResult.vulnerabilities.length > 10 && (
                      <span className="px-1.5 py-0.5 text-[10px] text-muted-dim">+{shodanResult.vulnerabilities.length - 10} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Editable fields (auto-filled or manual) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Status</label>
              <select value={hostStatus} onChange={(e) => setHostStatus(e.target.value as HostStatus)} className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30">
                <option>Live</option><option>Down</option><option>Filtered</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Likelihood</label>
              <select value={exploitability} onChange={(e) => setExploitability(e.target.value as Likelihood)} className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30">
                <option>Info</option><option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">OS guess</label>
              <input type="text" value={osGuess} onChange={(e) => setOsGuess(e.target.value)} placeholder="Ubuntu 22.04" className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Checked by</label>
              <input type="text" value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} placeholder="You" className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Open ports</label>
            <input type="text" value={ports} onChange={(e) => setPorts(e.target.value)} placeholder="22, 80, 443, 3306" className="rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Services</label>
            <input type="text" value={services} onChange={(e) => setServices(e.target.value)} placeholder="SSH, HTTP, HTTPS" className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Auto-filled by Shodan or add manually" className="rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent/30" />
          </div>
          {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={handleAdd} disabled={loading} className="rounded-lg bg-gradient-to-r from-accent to-fuchsia px-5 py-2 text-xs font-semibold text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] disabled:opacity-50">
              {loading ? "Adding..." : "Add host"}
            </button>
            <button type="button" onClick={() => { setAdding(false); resetForm(); }} className="rounded-lg border border-white/5 px-5 py-2 text-xs text-muted hover:border-white/10 hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {hosts.length === 0 && !adding && (
        <button onClick={() => setAdding(true)} className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/8 px-8 py-16 text-center transition-all hover:border-accent/15 hover:bg-surface-hover">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.03] text-xl text-muted-dim">+</div>
          <p className="text-sm font-medium text-muted">Add your first host</p>
          <p className="mt-1 text-[11px] text-muted-dim">Enter IP and click Scan for Shodan recon</p>
        </button>
      )}

      {sortedHosts.length > 0 && (
        <div className="flex flex-col gap-1">
          {sortedHosts.map((h) => (
            <Link key={h.id} href={`/targets/${targetId}/hosts/${h.id}`} className="group flex items-center gap-4 rounded-lg border border-white/[0.03] px-4 py-3 transition-all duration-200 hover:border-white/8 hover:bg-surface-hover">
              <StatusDot status={h.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{h.ip}</span>
                  {h.os_guess && <span className="text-[11px] text-muted-dim">· {h.os_guess}</span>}
                  {h.checked_by === "shodan" && (
                    <span className="rounded bg-accent/10 px-1 py-0.5 text-[9px] font-medium text-accent">SHODAN</span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                  {h.open_ports && <span className="font-mono">{h.open_ports}</span>}
                  {h.services && <span>{h.services}</span>}
                  {h.checked_by && h.checked_by !== "shodan" && <span>by {h.checked_by}</span>}
                </div>
              </div>
              <LikelihoodBadge value={h.exploitability} />
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(h.id); }} disabled={deletingId === h.id} className="rounded-md p-1.5 text-muted-dim opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100" title="Delete host">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
