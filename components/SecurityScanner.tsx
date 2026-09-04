"use client";

import { useState } from "react";

function useScan() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function scan(url: string, test?: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, test }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setLoading(false); return null; }
      setLoading(false);
      return data;
    } catch { setError("Network error"); setLoading(false); return null; }
  }
  return { scan, loading, error };
}

function Check({ label, pass, detail }: { label: string; pass: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/[0.03] bg-background/50 px-3 py-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${pass ? "bg-emerald-400" : "bg-rose-400"}`} />
      <span className="text-xs">{label}</span>
      {detail && <span className="ml-auto text-[10px] text-muted-dim">{detail}</span>}
    </div>
  );
}

/* ─── SECURITY HEADERS ─── */
export function SecurityHeadersPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { scan, loading, error } = useScan();

  async function run() {
    if (!target.trim()) return;
    const data = await scan(target.trim(), "headers");
    if (data) setResult(data);
  }

  const passed = result?.headers?.filter((h: any) => h.good).length || 0;
  const total = result?.headers?.length || 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">🔒 Security Headers</h3>
        {result && <span className="text-[10px] text-muted-dim">{passed}/{total} passed</span>}
      </div>
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="https://example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={run} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "..." : "Scan"}</button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result?.headers && (
        <div className="flex flex-col gap-1 animate-fade-in">
          {result.headers.map((h: any) => (
            <Check key={h.name} label={h.name} pass={h.good} detail={h.desc} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── CORS TESTER ─── */
export function CorsPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { scan, loading, error } = useScan();

  async function run() {
    if (!target.trim()) return;
    const data = await scan(target.trim(), "cors");
    if (data) setResult(data);
  }

  const cors = result?.cors;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">🌐 CORS Tester</h3>
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="https://example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={run} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "..." : "Test"}</button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {cors && (
        <div className="flex flex-col gap-2 animate-fade-in">
          <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            cors.status === "safe" ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400" :
            cors.status === "vulnerable" ? "border border-rose-500/20 bg-rose-500/10 text-rose-400" :
            "border border-white/5 bg-background text-muted"
          }`}>
            {cors.status === "safe" ? "✅ CORS looks safe" :
             cors.status === "vulnerable" ? "⚠️ CORS issues found" : "ℹ️ No CORS headers"}
          </div>
          {cors.acao && <div className="text-[11px]"><span className="text-muted-dim">Access-Control-Allow-Origin:</span> <span className="font-mono">{cors.acao}</span></div>}
          {cors.acac && <div className="text-[11px]"><span className="text-muted-dim">Access-Control-Allow-Credentials:</span> <span className="font-mono">{cors.acac}</span></div>}
          {cors.issues.map((i: string, idx: number) => (
            <div key={idx} className="flex items-center gap-2 rounded-md border border-rose-500/10 bg-rose-500/5 px-3 py-1.5 text-[11px] text-rose-300">
              <span>⚠</span> {i}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── WAF DETECTION ─── */
export function WafPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { scan, loading, error } = useScan();

  async function run() {
    if (!target.trim()) return;
    const data = await scan(target.trim(), "waf");
    if (data) setResult(data);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">🛡️ WAF Detection</h3>
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="https://example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={run} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "..." : "Detect"}</button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result?.waf && (
        <div className="flex flex-col gap-2 animate-fade-in">
          {result.waf.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-background px-3 py-2 text-xs text-muted">No WAF detected</div>
          ) : (
            result.waf.map((w: any, i: number) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-accent/10 bg-accent/5 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-sm font-medium">{w.name}</span>
                <span className="ml-auto rounded bg-accent/15 px-1.5 py-0.5 text-[9px] text-accent">{w.confidence}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─── HTTP METHODS ─── */
export function MethodsPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { scan, loading, error } = useScan();

  async function run() {
    if (!target.trim()) return;
    const data = await scan(target.trim(), "methods");
    if (data) setResult(data);
  }

  const m = result?.methods;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">⚡ HTTP Methods</h3>
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="https://example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={run} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "..." : "Test"}</button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {m && (
        <div className="flex flex-col gap-2 animate-fade-in">
          <div className="flex flex-wrap gap-1">
            {m.allowed.map((method: string) => (
              <span key={method} className="rounded-md border border-white/5 bg-surface px-2 py-0.5 font-mono text-xs">{method}</span>
            ))}
          </div>
          {m.hasPut && <div className="text-[11px] text-amber-400">⚠ PUT method enabled</div>}
          {m.hasDelete && <div className="text-[11px] text-rose-400">⚠ DELETE method enabled</div>}
          {m.hasPatch && <div className="text-[11px] text-amber-400">⚠ PATCH method enabled</div>}
          {!m.hasPut && !m.hasDelete && !m.hasPatch && m.allowed.length > 0 && (
            <div className="text-[11px] text-emerald-400">✅ Only safe methods allowed</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── COOKIE ANALYZER ─── */
export function CookiesPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { scan, loading, error } = useScan();

  async function run() {
    if (!target.trim()) return;
    const data = await scan(target.trim(), "cookies");
    if (data) setResult(data);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">🍪 Cookie Analyzer</h3>
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="https://example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={run} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "..." : "Analyze"}</button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result?.cookies && (
        <div className="flex flex-col gap-2 animate-fade-in">
          {result.cookies.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-background px-3 py-2 text-xs text-muted">No cookies set</div>
          ) : (
            result.cookies.map((c: any, i: number) => (
              <div key={i} className="rounded-lg border border-white/[0.03] bg-background/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium">{c.name}</span>
                  <span className={`rounded px-1 py-0.5 text-[9px] ${c.secure ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                    {c.secure ? "Secure ✓" : "No Secure"}
                  </span>
                  <span className={`rounded px-1 py-0.5 text-[9px] ${c.httponly ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                    {c.httponly ? "HttpOnly ✓" : "No HttpOnly"}
                  </span>
                  <span className="rounded bg-surface px-1 py-0.5 text-[9px] text-muted">SameSite: {c.samesite}</span>
                </div>
                {c.issues.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.issues.map((issue: string, j: number) => (
                      <span key={j} className="text-[10px] text-amber-400">⚠ {issue}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─── TLS ANALYSIS ─── */
export function TlsPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { scan, loading, error } = useScan();

  async function run() {
    if (!target.trim()) return;
    const data = await scan(target.trim(), "tls");
    if (data) setResult(data);
  }

  const tls = result?.tls;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">🔐 TLS / HSTS</h3>
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="https://example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={run} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "..." : "Analyze"}</button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {tls && (
        <div className="flex flex-col gap-2 animate-fade-in">
          <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${tls.hsts ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border border-rose-500/20 bg-rose-500/10 text-rose-400"}`}>
            {tls.hsts ? "✅ HSTS Enabled" : "❌ HSTS Not Enabled"}
          </div>
          {tls.hsts && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {tls.maxAge && <span>max-age: <span className="font-mono">{tls.maxAge}</span></span>}
              {tls.includeSubDomains && <span className="text-emerald-400">includeSubDomains ✓</span>}
              {tls.preload && <span className="text-emerald-400">preload ✓</span>}
            </div>
          )}
          {tls.protocol && <div className="text-[11px] text-muted-dim">Server: <span className="font-mono">{tls.protocol}</span></div>}
        </div>
      )}
    </div>
  );
}
