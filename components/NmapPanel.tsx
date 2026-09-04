"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface NmapResult {
  ip: string;
  hostname: string;
  status: string;
  ports: { port: number; state: string; service: string; version: string }[];
  os: string;
  raw: string;
}

export function NmapPanel({
  targetId,
  targetName,
  onResults,
}: {
  targetId: string;
  targetName: string;
  onResults?: (results: NmapResult[]) => void;
}) {
  const [target, setTarget] = useState("");
  const [scanType, setScanType] = useState("quick");
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<NmapResult[]>([]);
  const [rawOutput, setRawOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"scan" | "paste">("paste");

  const scanTypes = [
    { id: "quick", label: "Quick scan", flags: "-sV -T4 --top-ports 100" },
    { id: "full", label: "Full scan", flags: "-sV -sC -T4 -p-" },
    { id: "stealth", label: "Stealth scan", flags: "-sS -T2 -Pn" },
    { id: "udp", label: "UDP scan", flags: "-sU -T4 --top-ports 20" },
    { id: "vuln", label: "Vuln scan", flags: "--script vuln -sV" },
  ];

  async function handleScan() {
    if (!target.trim()) { setError("Enter a target IP or range"); return; }
    setError(null); setScanning(true); setResults([]); setRawOutput("");

    try {
      const res = await fetch("/api/nmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: target.trim(),
          flags: scanTypes.find((s) => s.id === scanType)?.flags ?? "-sV",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Scan failed");
        setScanning(false);
        return;
      }

      setResults(data.results || []);
      setRawOutput(data.raw || "");

      // Auto-save hosts from results
      if (data.results?.length > 0) {
        const supabase = createClient();
        for (const r of data.results) {
          const portsStr = r.ports?.map((p: { port: number }) => p.port).join(", ") || "";
          const servicesStr = r.ports?.map((p: { service: string; port: number }) => `${p.service}(${p.port})`).join(", ") || "";
          await supabase.from("hosts").insert({
            target_id: targetId,
            ip: r.ip,
            status: r.status === "up" ? "Live" : "Down",
            open_ports: portsStr || null,
            services: servicesStr || null,
            os_guess: r.os || null,
            exploitability: "Info",
            checked_by: "nmap",
            last_scanned: new Date().toISOString().split("T")[0],
          }).select();
        }
      }

      onResults?.(data.results || []);
    } catch (e) {
      setError("Network error — is the scan API running?");
    }
    setScanning(false);
  }

  function handlePasteImport() {
    if (!rawOutput.trim()) return;
    const lines = rawOutput.split("\n");
    const parsed: NmapResult[] = [];
    let current: NmapResult | null = null;

    for (const line of lines) {
      const hostMatch = line.match(/Nmap scan report for (.+?)(?:\s+\((\d+\.\d+\.\d+\.\d+)\))?$/);
      if (hostMatch) {
        if (current) parsed.push(current);
        current = {
          ip: hostMatch[2] || hostMatch[1],
          hostname: hostMatch[2] ? hostMatch[1] : "",
          status: "up",
          ports: [],
          os: "",
          raw: "",
        };
        continue;
      }

      const portMatch = line.match(/(\d+)\/(tcp|udp)\s+(\S+)\s+(.+)/);
      if (portMatch && current) {
        current.ports.push({
          port: parseInt(portMatch[1]),
          state: portMatch[3],
          service: portMatch[4].trim(),
          version: "",
        });
      }
    }
    if (current) parsed.push(current);

    setResults(parsed);
    onResults?.(parsed);
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/5 bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">
          🔍 Nmap — {targetName}
        </h3>
        <div className="flex gap-1">
          <button onClick={() => setMode("paste")} className={`rounded px-2 py-0.5 text-[10px] font-medium transition-all ${mode === "paste" ? "bg-accent/10 text-accent" : "text-muted-dim hover:text-foreground"}`}>
            Paste output
          </button>
          <button onClick={() => setMode("scan")} className={`rounded px-2 py-0.5 text-[10px] font-medium transition-all ${mode === "scan" ? "bg-accent/10 text-accent" : "text-muted-dim hover:text-foreground"}`}>
            Run scan
          </button>
        </div>
      </div>

      {mode === "scan" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="IP, range, or hostname (e.g. 192.168.1.0/24)"
              className="flex-1 rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent/30"
            />
            <select
              value={scanType}
              onChange={(e) => setScanType(e.target.value)}
              className="rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-accent/30"
            >
              {scanTypes.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2 text-xs font-semibold text-white hover:shadow-[0_0_16px_rgba(168,85,247,0.3)] disabled:opacity-50"
            >
              {scanning ? "Scanning..." : "Scan"}
            </button>
          </div>
          <p className="text-[10px] text-muted-dim">
            Flags: <code className="font-mono text-accent">{scanTypes.find((s) => s.id === scanType)?.flags}</code>
          </p>
          <p className="text-[10px] text-amber-400/80">
            ⚠ Scanning requires nmap installed on the server. Use "Paste output" for Vercel deployments.
          </p>
        </div>
      )}

      {mode === "paste" && (
        <div className="flex flex-col gap-3">
          <textarea
            value={rawOutput}
            onChange={(e) => setRawOutput(e.target.value)}
            rows={8}
            placeholder={"Paste nmap output here...\n\nnmap -sV target.com\n\nOr paste from any tool that outputs nmap format."}
            className="rounded-lg border border-white/5 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent/30"
          />
          <button
            onClick={handlePasteImport}
            className="self-start rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-1.5 text-xs font-semibold text-white hover:shadow-[0_0_16px_rgba(168,85,247,0.3)]"
          >
            Import results
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-muted-dim">
            {results.length} host{results.length !== 1 ? "s" : ""} discovered
          </p>
          <div className="flex flex-col gap-1">
            {results.map((r, i) => (
              <div key={i} className="rounded-lg border border-white/[0.03] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${r.status === "up" ? "bg-emerald-400" : "bg-rose-400"}`} />
                  <span className="font-mono text-sm">{r.ip}</span>
                  {r.hostname && <span className="text-[11px] text-muted-dim">({r.hostname})</span>}
                  {r.os && <span className="text-[10px] text-muted">{r.os}</span>}
                </div>
                  {r.ports.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.ports.map((p: { port: number; state: string; service: string; version: string }) => (
                      <span key={p.port} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        {p.port}/{p.state} {p.service}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
