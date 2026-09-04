"use client";

import { useState } from "react";

function useWhois() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function query(service: string, target: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/whois", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, target }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Request failed"); setLoading(false); return null; }
      setLoading(false);
      return json.data;
    } catch {
      setError("Network error"); setLoading(false); return null;
    }
  }
  return { query, loading, error };
}

function Field({ label, value }: { label: string; value: any }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-dim">{label}</span>
      <span className="text-sm break-all">{String(value)}</span>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">{icon} {title}</h3>
      {children}
    </div>
  );
}

/* ─── WHOIS ─── */
export function WhoisPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("whois", target.trim());
    if (data) setResult(data);
  }

  return (
    <Panel title="WHOIS Lookup" icon="📋">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Lookup"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 animate-fade-in">
          <Field label="Domain" value={result.WhoisRecord?.domainName} />
          <Field label="Registrar" value={result.WhoisRecord?.registrarName} />
          <Field label="Created" value={result.WhoisRecord?.createdDate} />
          <Field label="Expires" value={result.WhoisRecord?.expiresDate} />
          <Field label="Updated" value={result.WhoisRecord?.updatedDate} />
          <Field label="Status" value={result.WhoisRecord?.status?.join(", ")} />
          <Field label="Name Servers" value={result.WhoisRecord?.nameServers?.join(", ")} />
          <Field label="Registrant" value={result.WhoisRecord?.registrant?.name} />
          <Field label="Organization" value={result.WhoisRecord?.registrant?.organization} />
          <Field label="Country" value={result.WhoisRecord?.registrant?.country} />
        </div>
      )}
    </Panel>
  );
}

/* ─── DNS ─── */
export function DnsPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("dns", target.trim());
    if (data) setResult(data);
  }

  const records = result?.records || result?.DNS || [];
  const grouped = Array.isArray(records) ? records : [];

  return (
    <Panel title="DNS Lookup" icon="🌐">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Resolve"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="flex flex-col gap-2 animate-fade-in">
          {typeof result === "object" && Object.entries(result).map(([type, vals]) => {
            if (type === "domain" || type === "qname") return null;
            if (!vals || (Array.isArray(vals) && vals.length === 0)) return null;
            return (
              <div key={type} className="rounded-lg border border-white/[0.03] bg-background/50 p-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-accent">{type}</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {Array.isArray(vals) ? vals.map((v: any, i: number) => (
                    <span key={i} className="rounded bg-surface px-2 py-0.5 font-mono text-xs">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                  )) : (
                    <span className="rounded bg-surface px-2 py-0.5 font-mono text-xs">{String(vals)}</span>
                  )}
                </div>
              </div>
            );
          })}
          {/* Raw JSON fallback */}
          {Object.keys(result).length > 0 && (
            <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 font-mono text-[11px] text-muted">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </Panel>
  );
}

/* ─── IP GEOLOCATION ─── */
export function GeoPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("geo", target.trim());
    if (data) setResult(data);
  }

  const r = result?.location || result;

  return (
    <Panel title="IP Geolocation" icon="🌍">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="1.2.3.4" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Locate"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {r && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 animate-fade-in">
          <Field label="IP" value={r.ip || result?.ip} />
          <Field label="Country" value={r.country?.name || r.countryName} />
          <Field label="Region" value={r.region?.name || r.state_prov} />
          <Field label="City" value={r.city?.name || r.city} />
          <Field label="ZIP" value={r.postalCode || r.zipcode} />
          <Field label="Lat" value={r.location?.latitude || r.latitude} />
          <Field label="Lon" value={r.location?.longitude || r.longitude} />
          <Field label="ISP" value={r.isp?.name || r.isp} />
          <Field label="Org" value={r.as?.name || r.org} />
          <Field label="Timezone" value={r.location?.time_zone || r.timezone} />
        </div>
      )}
    </Panel>
  );
}

/* ─── SSL CERTIFICATE ─── */
export function SslPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("ssl", target.trim());
    if (data) setResult(data);
  }

  // Handle various response formats
  const cert = result?.sslCertificates?.[0] || result?.sslCertificate || result?.certificate || result;

  return (
    <Panel title="SSL Certificate" icon="🔒">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Check"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {cert && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 animate-fade-in">
          <Field label="Subject CN" value={cert.subjectCN || cert.commonName || cert.subject} />
          <Field label="Issuer" value={cert.issuerCN || cert.issuerOrganization || cert.issuer} />
          <Field label="Valid From" value={cert.validFrom || cert.notBefore || cert.issuedOn} />
          <Field label="Valid To" value={cert.validTo || cert.notAfter || cert.expiresOn} />
          <Field label="Serial" value={cert.serialNumber} />
          <Field label="Key Size" value={cert.keySize || cert.keySizeInBits} />
          <Field label="SAN" value={cert.subjectAltName?.join?.(", ") || cert.san} />
          <Field label="Signature Alg" value={cert.signatureAlgorithm || cert.signatureAlg} />
        </div>
      )}
      {cert && (
        <pre className="max-h-32 overflow-auto rounded-lg bg-background p-2 font-mono text-[10px] text-muted-dim">
          {JSON.stringify(cert, null, 2).slice(0, 500)}
        </pre>
      )}
    </Panel>
  );
}

/* ─── THREAT INTELLIGENCE ─── */
export function ThreatPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("threat", target.trim());
    if (data) setResult(data);
  }

  return (
    <Panel title="Threat Intelligence" icon="⚠️">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="IP or domain" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Scan"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 font-mono text-[11px] text-muted">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </Panel>
  );
}

/* ─── DOMAIN REPUTATION ─── */
export function ReputationPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("reputation", target.trim());
    if (data) setResult(data);
  }

  const rep = result?.domainReputation || result?.reputation || result;

  return (
    <Panel title="Domain Reputation" icon="🛡️">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Check"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {rep && (
        <div className="flex flex-col gap-3 animate-fade-in">
          {rep.score !== undefined && (
            <div className={`rounded-lg px-4 py-3 text-center text-sm font-semibold ${
              rep.score >= 80 ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400" :
              rep.score >= 50 ? "border border-amber-500/20 bg-amber-500/10 text-amber-400" :
              "border border-rose-500/20 bg-rose-500/10 text-rose-400"
            }`}>
              Score: {rep.score}/100
            </div>
          )}
          {rep.threatScore !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-dim">Threat Score:</span>
              <span className="font-mono text-sm font-medium">{rep.threatScore}</span>
            </div>
          )}
          {rep.categories && (
            <div className="flex flex-wrap gap-1">
              {rep.categories.map((c: string, i: number) => (
                <span key={i} className="rounded-md border border-white/5 bg-surface px-2 py-0.5 text-[11px]">{c}</span>
              ))}
            </div>
          )}
          <pre className="max-h-48 overflow-auto rounded-lg bg-background p-3 font-mono text-[11px] text-muted">
            {JSON.stringify(rep, null, 2)}
          </pre>
        </div>
      )}
    </Panel>
  );
}

/* ─── WEBSITE CATEGORIZATION ─── */
export function CategorizationPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("categorization", target.trim());
    if (data) setResult(data);
  }

  return (
    <Panel title="Website Categorization" icon="🏷️">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Categorize"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 font-mono text-[11px] text-muted">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </Panel>
  );
}

/* ─── DOMAIN AVAILABILITY ─── */
export function AvailabilityPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("availability", target.trim());
    if (data) setResult(data);
  }

  const avail = result?.DomainInfo || result;
  const isAvailable = avail?.domainAvailability === "AVAILABLE";

  return (
    <Panel title="Domain Availability" icon="✅">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Check"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="flex flex-col gap-3 animate-fade-in">
          {avail?.domainAvailability && (
            <div className={`rounded-lg px-4 py-3 text-center text-sm font-semibold ${isAvailable ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border border-rose-500/20 bg-rose-500/10 text-rose-400"}`}>
              {isAvailable ? "✅ AVAILABLE" : "❌ TAKEN"}
            </div>
          )}
          <pre className="max-h-48 overflow-auto rounded-lg bg-background p-3 font-mono text-[11px] text-muted">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </Panel>
  );
}

/* ─── VPN / PROXY DETECTION ─── */
export function VpnPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("vpn", target.trim());
    if (data) setResult(data);
  }

  return (
    <Panel title="VPN & Proxy Detection" icon="🕵️">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="IP address" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Detect"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 font-mono text-[11px] text-muted">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </Panel>
  );
}

/* ─── EMAIL VERIFICATION ─── */
export function EmailPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("email", target.trim());
    if (data) setResult(data);
  }

  return (
    <Panel title="Email Verification" icon="📧">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="user@example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Verify"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 font-mono text-[11px] text-muted">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </Panel>
  );
}

/* ─── SCREENSHOT ─── */
export function ScreenshotPanel({ defaultTarget }: { defaultTarget?: string }) {
  const [target, setTarget] = useState(defaultTarget || "");
  const [result, setResult] = useState<any>(null);
  const { query, loading, error } = useWhois();

  async function handleSearch() {
    if (!target.trim()) return;
    const data = await query("screenshot", target.trim());
    if (data) setResult(data);
  }

  return (
    <Panel title="Screenshot Capture" icon="📸">
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="https://example.com" className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30" />
        <button onClick={handleSearch} disabled={loading} className="shrink-0 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "..." : "Capture"}
        </button>
      </div>
      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">{error}</div>}
      {result && (
        <div className="flex flex-col gap-3 animate-fade-in">
          {result.screenshot && (
            <img src={result.screenshot} alt="Screenshot" className="rounded-lg border border-white/5" />
          )}
          <pre className="max-h-48 overflow-auto rounded-lg bg-background p-3 font-mono text-[11px] text-muted">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </Panel>
  );
}
