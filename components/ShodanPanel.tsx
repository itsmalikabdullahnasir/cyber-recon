"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface CVE {
  id: string;
  description: string;
  cvss: number | null;
  severity: string | null;
  vector: string | null;
  published: string;
  references: string[];
}

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
  techCVEs: Record<string, CVE[]>;
  lastUpdate: string;
}

function SeverityBadge({ sev }: { sev: string | null }) {
  if (!sev) return null;
  const s = sev.toLowerCase();
  const colors: Record<string, string> = {
    critical: "border-rose-500/30 bg-rose-500/15 text-rose-300",
    high: "border-pink-500/30 bg-pink-500/15 text-pink-300",
    medium: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    low: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  };
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${colors[s] || "border-white/10 bg-white/5 text-muted"}`}>
      {sev}
    </span>
  );
}

export function ShodanPanel({
  targetId,
  targetName,
}: {
  targetId: string;
  targetName: string;
}) {
  const [target, setTarget] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ShodanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleScan() {
    if (!target.trim()) { setError("Enter an IP address"); return; }
    setError(null); setScanning(true); setResult(null); setSaved(false);

    try {
      const res = await fetch("/api/shodan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: target.trim() }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || "Scan failed"); setScanning(false); return; }
      setResult(data);
    } catch {
      setError("Network error");
    }
    setScanning(false);
  }

  async function handleSaveAsHost() {
    if (!result) return;
    setSaving(true);
    const supabase = createClient();

    const portsStr = result.ports.join(", ");
    const servicesStr = result.services
      .map((s) => `${s.product || s.port}/${s.protocol}`)
      .join(", ");

    // Collect all CVE IDs from tech stack
    const allCVEs = Object.values(result.techCVEs).flat().map((c) => c.id);
    const shodanCVEs = result.vulnerabilities.filter((v) => v.startsWith("CVE-"));

    const { error } = await supabase.from("hosts").insert({
      target_id: targetId,
      ip: result.ip,
      status: "Live",
      open_ports: portsStr || null,
      services: servicesStr || null,
      os_guess: result.os || null,
      exploitability: allCVEs.length > 3 || shodanCVEs.length > 3 ? "High" :
                      allCVEs.length > 0 || shodanCVEs.length > 0 ? "Medium" : "Info",
      notes: [
        result.hostname && `hostname: ${result.hostname}`,
        result.country && `location: ${result.city}, ${result.country}`,
        result.isp && `ISP: ${result.isp}`,
        result.organization && `Org: ${result.organization}`,
        (allCVEs.length > 0 || shodanCVEs.length > 0) && `CVEs: ${[...new Set([...allCVEs, ...shodanCVEs])].join(", ")}`,
      ].filter(Boolean).join("\n") || null,
      checked_by: "shodan",
      last_scanned: new Date().toISOString().split("T")[0],
    });

    if (!error) setSaved(true);
    setSaving(false);
  }

  const totalCVEs = Object.values(result?.techCVEs || {}).flat().length;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/5 bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">
          🔍 Shodan recon — {targetName}
        </h3>
        {scanning && (
          <span className="text-[10px] text-accent animate-pulse">+ NVD CVE lookup running...</span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Enter IP address (e.g. 8.8.8.8)"
          onKeyDown={(e) => e.key === "Enter" && handleScan()}
          className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none transition-all focus:border-accent/30 focus:shadow-[0_0_0_1px_rgba(168,85,247,0.1)]"
        />
        <button
          onClick={handleScan}
          disabled={scanning}
          className="rounded-lg bg-gradient-to-r from-accent to-fuchsia px-5 py-2 text-xs font-semibold text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] disabled:opacity-50"
        >
          {scanning ? (
            <span className="flex items-center gap-1.5">
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.3" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>
              Scanning...
            </span>
          ) : "Scan"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4 animate-fade-in">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-background p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">IP</p>
              <p className="mt-1 font-mono text-sm">{result.ip}</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Hostname</p>
              <p className="mt-1 text-sm">{result.hostname || "—"}</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">OS</p>
              <p className="mt-1 text-sm">{result.os || "—"}</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Location</p>
              <p className="mt-1 text-sm">{result.city && result.country ? `${result.city}, ${result.country}` : result.country || "—"}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-background p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">ISP</p>
              <p className="mt-1 text-sm">{result.isp || "—"}</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Organization</p>
              <p className="mt-1 text-sm">{result.organization || "—"}</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Open ports</p>
              <p className="mt-1 font-mono text-sm">{result.ports.length}</p>
            </div>
          </div>

          {/* Services */}
          {result.services.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim mb-2">Services & Tech Stack</p>
              <div className="flex flex-col gap-1">
                {result.services.map((s, i) => {
                  const techKey = s.version ? `${s.product} ${s.version}` : s.product;
                  const hasCVEs = s.product && result.techCVEs[techKey];
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-white/[0.03] px-3 py-2">
                      <span className="font-mono text-sm font-medium text-accent">{s.port}</span>
                      <span className="text-[11px] text-muted-dim">{s.protocol}</span>
                      <span className="text-sm">{s.product || "unknown"}</span>
                      {s.version && <span className="text-[11px] text-muted">{s.version}</span>}
                      {hasCVEs && (
                        <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-rose-400">
                          {result.techCVEs[techKey].length} CVE{result.techCVEs[techKey].length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {s.banner && (
                        <span className="ml-auto max-w-[200px] truncate font-mono text-[10px] text-muted-dim">
                          {s.banner}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Shodan Vulnerabilities */}
          {result.vulnerabilities.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim mb-2">
                Shodan CVEs ({result.vulnerabilities.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {result.vulnerabilities.slice(0, 20).map((v, i) => (
                  <a key={i} href={`https://nvd.nist.gov/vuln/detail/${v}`} target="_blank" rel="noopener noreferrer"
                    className="rounded-md border border-rose-500/20 bg-rose-500/8 px-1.5 py-0.5 font-mono text-[10px] text-rose-400 hover:bg-rose-500/15 hover:border-rose-500/30 transition-all">
                    {v} ↗
                  </a>
                ))}
                {result.vulnerabilities.length > 20 && (
                  <span className="px-1.5 py-0.5 text-[10px] text-muted-dim">
                    +{result.vulnerabilities.length - 20} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Tech Stack CVEs from NVD */}
          {totalCVEs > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
                🔎 CVEs from tech stack ({totalCVEs} found via NVD)
              </p>
              {Object.entries(result.techCVEs).map(([tech, cves]) => (
                <div key={tech} className="rounded-lg border border-accent/10 bg-accent/[0.03] p-3">
                  <p className="mb-2 text-xs font-semibold text-accent">{tech}</p>
                  <div className="flex flex-col gap-1.5">
                    {cves.map((cve) => (
                      <div key={cve.id} className="flex items-start gap-2 rounded-md border border-white/[0.03] bg-background/50 px-3 py-2">
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={`https://nvd.nist.gov/vuln/detail/${cve.id}`} target="_blank" rel="noopener noreferrer"
                            className="font-mono text-xs font-medium text-accent hover:underline">
                            {cve.id} ↗
                          </a>
                          {cve.cvss && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              cve.cvss >= 9 ? "bg-rose-500/20 text-rose-300" :
                              cve.cvss >= 7 ? "bg-pink-500/20 text-pink-300" :
                              cve.cvss >= 4 ? "bg-amber-500/20 text-amber-300" :
                              "bg-emerald-500/20 text-emerald-300"
                            }`}>
                              {cve.cvss}
                            </span>
                          )}
                          <SeverityBadge sev={cve.severity} />
                        </div>
                        <p className="mt-1 text-[11px] text-muted leading-relaxed line-clamp-2">{cve.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalCVEs === 0 && result.services.some((s) => s.product) && (
            <div className="rounded-lg border border-white/[0.03] bg-background/50 px-4 py-3 text-center text-xs text-muted-dim">
              No CVEs found for discovered tech stack — NVD may have rate limited. Try again later.
            </div>
          )}

          {/* Save button */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAsHost}
              disabled={saving || saved}
              className="rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white hover:shadow-[0_0_16px_rgba(168,85,247,0.3)] disabled:opacity-50"
            >
              {saving ? "Saving..." : saved ? "Saved to hosts" : "Save as host"}
            </button>
            {saved && <span className="text-xs text-emerald-400">Added to hosts</span>}
          </div>
        </div>
      )}
    </div>
  );
}
