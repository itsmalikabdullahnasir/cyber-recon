"use client";

import { useState } from "react";

function useInfra() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function query(service: string, target: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/infra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, target }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setLoading(false); return null; }
      setLoading(false);
      return data.data;
    } catch { setError("Network error"); setLoading(false); return null; }
  }
  return { query, loading, error };
}

/* ─── BGP / ASN LOOKUP ─── */
export function BgpPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useInfra();

  async function run() {
    if (!target.trim()) return;
    const data = await query("bgp", target.trim());
    if (data) setResult(data);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">🌍 BGP / ASN Lookup</h3>
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="IP address" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={run} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "..." : "Lookup"}</button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 animate-fade-in">
          {[
            ["IP", result.ip],
            ["Hostname", result.hostname],
            ["City", result.city],
            ["Region", result.region],
            ["Country", result.country],
            ["Coordinates", result.loc],
            ["Org / ASN", result.org],
            ["Postal", result.postal],
            ["Timezone", result.timezone],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="rounded-md bg-background/50 px-3 py-2">
              <p className="text-[9px] uppercase text-muted-dim">{label}</p>
              <p className="text-xs font-medium break-all">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── CDN DETECTION ─── */
export function CdnPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useInfra();

  async function run() {
    if (!target.trim()) return;
    const data = await query("cdn", target.trim());
    if (data) setResult(data);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">📡 CDN Detection</h3>
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={run} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "..." : "Detect"}</button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="flex flex-col gap-2 animate-fade-in">
          {result.server && <div className="text-[11px] text-muted-dim">Server: <span className="font-mono">{result.server}</span></div>}
          {result.poweredBy && <div className="text-[11px] text-muted-dim">X-Powered-By: <span className="font-mono">{result.poweredBy}</span></div>}
          {result.cdns?.length > 0 ? (
            <div className="flex flex-col gap-1">
              {result.cdns.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-accent/10 bg-accent/5 px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="ml-auto text-[10px] text-muted-dim">{c.evidence}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-white/5 bg-background px-3 py-2 text-xs text-muted">No CDN detected — direct server</div>
          )}
          {result.headers && (
            <details className="rounded-lg border border-white/5 bg-background">
              <summary className="cursor-pointer px-3 py-2 text-[10px] text-muted-dim">Raw headers</summary>
              <pre className="max-h-32 overflow-auto px-3 pb-2 font-mono text-[10px] text-muted">
                {JSON.stringify(result.headers, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── IP NETBLOCKS ─── */
export function NetblocksPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useInfra();

  async function run() {
    if (!target.trim()) return;
    const data = await query("netblocks", target.trim());
    if (data) setResult(data);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">📦 IP Netblocks</h3>
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="IP address" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={run} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "..." : "Lookup"}</button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="flex flex-col gap-2 animate-fade-in">
          <pre className="max-h-48 overflow-auto rounded-lg bg-background p-3 font-mono text-[11px] text-muted">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ─── DOMAIN HISTORY ─── */
export function HistoryPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useInfra();

  async function run() {
    if (!target.trim()) return;
    const data = await query("history", target.trim());
    if (data) setResult(data);
  }

  const whois = result?.WhoisRecord;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">📜 Domain History</h3>
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={run} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "..." : "Lookup"}</button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {whois && (
        <div className="flex flex-col gap-2 animate-fade-in">
          {[
            ["Registrar", whois.registrarName],
            ["Created", whois.createdDate],
            ["Expires", whois.expiresDate],
            ["Updated", whois.updatedDate],
            ["Registrant", whois.registrant?.name],
            ["Organization", whois.registrant?.organization],
            ["Country", whois.registrant?.country],
            ["Name Servers", whois.nameServers?.join?.(", ")],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex justify-between rounded-md bg-background/50 px-3 py-2 text-[11px]">
              <span className="text-muted-dim">{label}</span>
              <span className="text-right font-medium">{String(value).slice(0, 80)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
