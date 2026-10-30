"use client";

import { useEffect, useMemo, useState } from "react";
import type { Finding, Host, Scan, ScopeEntry, Subdomain } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { ScopeManager } from "@/components/ScopeManager";
import { ReconResults } from "@/components/ReconResults";
import { ScanRow } from "@/components/ScanRow";

type Mode = "passive" | "full";

export function ConsoleClient({
  consoleTargetId,
  scopeEntries,
  initialScans,
  subdomains,
  hosts,
  findings,
}: {
  consoleTargetId: string;
  scopeEntries: ScopeEntry[];
  initialScans: Scan[];
  subdomains: Subdomain[];
  hosts: Host[];
  findings: Finding[];
}) {
  const [input, setInput] = useState("");
  const [bulk, setBulk] = useState(false);
  const [mode, setMode] = useState<Mode>("passive");
  const [scans, setScans] = useState<Scan[]>(initialScans);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Live scan updates for the console target.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`console-scans:${consoleTargetId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scans", filter: `target_id=eq.${consoleTargetId}` },
        (payload) => {
          const row = payload.new as Scan;
          setScans((prev) =>
            [row, ...prev.filter((s) => s.id !== row.id)]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 25),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [consoleTargetId]);

  // Parse the input box: JSON array, or newline/comma separated.
  const parsedTargets = useMemo(() => parseInput(input), [input]);

  async function launch() {
    if (parsedTargets.length === 0) {
      setNotice({ kind: "err", text: "Enter at least one IP or domain" });
      return;
    }
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch("/api/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, targets: parsedTargets }),
      });
      const data = await res.json();
      if (res.status === 503 || res.status === 401) {
        setNotice({ kind: "err", text: data.error });
      } else {
        const refused = (data.results ?? []).filter(
          (r: { status: string }) => r.status !== "accepted",
        );
        const parts = [`${data.accepted}/${data.total} scan(s) queued`];
        if (refused.length) {
          parts.push(
            ...refused.map((r: { target: string; error?: string }) => `✗ ${r.target}: ${r.error}`),
          );
        }
        setNotice({ kind: data.accepted > 0 ? "ok" : "err", text: parts.join(" · ") });
        if (data.accepted > 0) setInput("");
      }
    } catch {
      setNotice({ kind: "err", text: "Could not reach the app server" });
    } finally {
      setBusy(false);
    }
  }

  const activeScan = scans.find((s) => s.status === "queued" || s.status === "running");
  const fullNeedsScope = mode === "full" && scopeEntries.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Launcher */}
      <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-surface to-surface/60 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">New scan</h2>
            <p className="text-[11px] text-muted-dim">
              Enter an IP or domain, or paste many. Jobs ship to your recon VM and stream back live below.
            </p>
          </div>
          <button
            onClick={() => setBulk((b) => !b)}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-foreground"
          >
            {bulk ? "Single" : "Bulk / JSON"}
          </button>
        </div>

        {bulk ? (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
            placeholder={'One per line, or JSON:\n["example.com", "203.0.113.10"]\nor\n[{"target":"example.com","mode":"full"}]'}
            className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 font-mono text-xs"
          />
        ) : (
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="example.com  or  203.0.113.10"
            className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 font-mono text-sm"
          />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
            <button
              onClick={() => setMode("passive")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                mode === "passive" ? "bg-accent/20 text-accent" : "text-muted-dim hover:text-foreground"
              }`}
            >
              Passive
            </button>
            <button
              onClick={() => setMode("full")}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                mode === "full" ? "bg-rose-500/20 text-rose-300" : "text-muted-dim hover:text-foreground"
              }`}
            >
              Full (active)
            </button>
          </div>

          <button
            onClick={launch}
            disabled={busy || parsedTargets.length === 0}
            className="rounded-lg border border-accent/30 bg-accent/15 px-4 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/25 disabled:opacity-40"
          >
            {busy ? "Launching…" : `Run ${parsedTargets.length || ""} scan${parsedTargets.length === 1 ? "" : "s"}`}
          </button>

          {activeScan && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              {activeScan.status === "queued" ? "Queued…" : `Running ${activeScan.input}: ${activeScan.stage ?? "starting"}`}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-dim">
          <span>{mode === "passive" ? "Passive" : "Full"} pipeline:</span>
          <span>subdomains → DNS → HTTP probe → whatweb/WAF → CVE-by-version</span>
          {mode === "full" && <span className="text-rose-400/80">→ nmap → testssl → dir brute → nuclei</span>}
        </div>

        {fullNeedsScope && (
          <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-400">
            Full (active) scans require an allowlist entry below. Without one, active stages are refused and only passive recon runs.
          </p>
        )}
        {notice && (
          <div
            className={`mt-2 flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-[11px] ${
              notice.kind === "ok"
                ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-300"
                : "border-rose-500/20 bg-rose-500/8 text-rose-300"
            }`}
          >
            {notice.text.split(" · ").map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </div>
        )}
      </div>

      {/* Allowlist */}
      <ScopeManager targetId={consoleTargetId} entries={scopeEntries} />

      {/* Live scans */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">
          Scan activity {scans.length > 0 && <span className="text-muted-dim">({scans.length})</span>}
        </h2>
        {scans.length === 0 ? (
          <p className="rounded-xl border border-white/5 bg-surface p-4 text-center text-xs text-muted-dim">
            No scans yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {scans.map((scan) => (
              <ScanRow key={scan.id} scan={scan} />
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Results</h2>
        <ReconResults subdomains={subdomains} hosts={hosts} findings={findings} />
      </div>
    </div>
  );
}

function parseInput(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Try JSON first (array of strings or objects).
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : [data];
      const out: string[] = [];
      for (const item of arr) {
        if (typeof item === "string") out.push(item.trim());
        else if (item && typeof item === "object") {
          const v = item.target ?? item.domain ?? item.ip ?? item.host;
          if (typeof v === "string") out.push(v.trim());
        }
      }
      return [...new Set(out.filter(Boolean))];
    } catch {
      // fall through to line/comma split
    }
  }
  return [...new Set(trimmed.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}
