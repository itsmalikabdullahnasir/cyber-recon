"use client";

import { useMemo, useState } from "react";
import type {
  Host,
  Finding,
  Likelihood,
  HostStatus,
  Severity,
  FindingStatus,
  Target,
  Scan,
} from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/types";
import { LikelihoodBadge } from "@/components/LikelihoodBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StatusDot } from "@/components/StatusDot";
import { createClient } from "@/lib/supabase/client";

type HostHistoryItem = {
  id: string;
  ip: string;
  status: string | null;
  open_ports: string | null;
  services: string | null;
  tech?: string[] | null;
  risk_score: number | null;
  captured_at: string;
};

type Subdomain = {
  id: string;
  subdomain: string;
  ips?: string[] | null;
  status?: string | null;
};

export function HostDetailClient({
  host,
  target,
  findings: initialFindings,
  history = [],
  subdomains = [],
  scans = [],
}: {
  host: Host;
  target?: Target;
  findings: Finding[];
  history?: HostHistoryItem[];
  subdomains?: Subdomain[];
  scans?: Scan[];
}) {
  const [ip, setIp] = useState(host.ip);
  const [status, setStatus] = useState<HostStatus>(host.status);
  const [ports, setPorts] = useState(host.open_ports ?? "");
  const [services, setServices] = useState(host.services ?? "");
  const [osGuess, setOsGuess] = useState(host.os_guess ?? "");
  const [exploitability, setExploitability] = useState<Likelihood>(host.exploitability);
  const [notes, setNotes] = useState(host.notes ?? "");
  const [checkedBy, setCheckedBy] = useState(host.checked_by ?? "");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"history" | "ports" | "tech" | "graph" | "scans" | "findings">("history");

  const [findingsList, setFindingsList] = useState<Finding[]>(initialFindings);
  const [fTitle, setFTitle] = useState("");
  const [fType, setFType] = useState("");
  const [fSeverity, setFSeverity] = useState<Severity>("Info");
  const [fStatus, setFStatus] = useState<FindingStatus>("New");
  const [fEvidence, setFEvidence] = useState("");
  const [fRemediation, setFRemediation] = useState("");
  const [fError, setFError] = useState<string | null>(null);
  const [fLoading, setFLoading] = useState(false);
  const [fAdding, setFAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Asset intelligence calculations
  const now = Date.now();
  const createdAtMs = host.created_at ? new Date(host.created_at).getTime() : 0;
  const lastScannedMs = host.last_scanned ? new Date(host.last_scanned).getTime() : 0;

  const isNewAsset = createdAtMs > 0 && now - createdAtMs < 7 * 86400000;
  const isDisappeared =
    host.status === "Filtered" ||
    (lastScannedMs > 0 && now - lastScannedMs > 14 * 86400000);

  // Associated subdomains matching this IP or host
  const associatedDomains = useMemo(() => {
    return subdomains.filter((s) => (s.ips ?? []).includes(host.ip) || s.subdomain === host.hostname);
  }, [subdomains, host.ip, host.hostname]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("hosts")
      .update({
        ip,
        status,
        open_ports: ports || null,
        services: services || null,
        os_guess: osGuess || null,
        exploitability,
        notes: notes || null,
        checked_by: checkedBy || null,
      })
      .eq("id", host.id);
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleAddFinding(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitle.trim()) {
      setFError("Title is required");
      return;
    }
    setFError(null);
    setFLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("findings")
      .insert({
        target_id: host.target_id,
        host_id: host.id,
        title: fTitle.trim(),
        type: fType.trim() || null,
        severity: fSeverity,
        status: fStatus,
        evidence: fEvidence.trim() || null,
        remediation: fRemediation.trim() || null,
      })
      .select()
      .single();

    if (error) {
      setFError(error.message);
      setFLoading(false);
      return;
    }

    if (data) {
      setFindingsList((prev) => [data as Finding, ...prev]);
    }
    setFTitle("");
    setFType("");
    setFSeverity("Info");
    setFStatus("New");
    setFEvidence("");
    setFRemediation("");
    setFLoading(false);
    setFAdding(false);
  }

    async function handleDeleteFinding(id: string) {
      setDeletingId(id);
      const supabase = createClient();
      await supabase.from("findings").delete().eq("id", id);
      setFindingsList((prev) => prev.filter((f) => f.id !== id));
      setDeletingId(null);
    }

  const sortedFindings = [...findingsList].sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
      );

    return (
      <div className="flex flex-col gap-6">
          {/* Asset Header with Intelligence Badges */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusDot status={status} />
                <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">{ip}</h1>
                {host.hostname && (
                  <span className="font-mono text-sm text-muted-dim">({host.hostname})</span>
                )}

                {/* Newly Discovered Asset Badge */}
                {isNewAsset && (
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/20">
                    ✦ Newly Discovered Asset (&lt;7d)
                  </span>
                )}

                {/* Inactive / Disappeared Asset Warning */}
                {isDisappeared && (
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/20">
                    ⚠ Inactive / Disappeared Asset
                  </span>
                )}
              </div>

              <p className="mt-1 text-xs text-muted-dim">
                Target: <span className="text-foreground">{target?.name ?? "Recon Target"}</span> · Last Scanned:{" "}
                {host.last_scanned ? new Date(host.last_scanned).toLocaleDateString() : "Never"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <LikelihoodBadge value={exploitability} />
              {host.risk_score !== null && host.risk_score !== undefined && (
                <span className="rounded-lg border border-accent/20 bg-surface px-3 py-1 font-mono text-xs font-bold text-accent">
                  Risk: {host.risk_score}
                </span>
              )}
            </div>
          </div>

              {/* Asset Configuration and Quick Updates */}
              <form onSubmit={handleSave} className="card flex flex-col gap-4 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">
                  Asset Configuration &amp; Metadata
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-dim">IP Address</label>
                    <input
                      type="text"
                      value={ip}
                      onChange={(e) => setIp(e.target.value)}
                      className="rounded-md border border-white/10 bg-background px-3 py-1.5 font-mono text-xs outline-none focus:border-accent/40"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-dim">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as HostStatus)}
                      className="rounded-md border border-white/10 bg-background px-3 py-1.5 text-xs outline-none focus:border-accent/40"
                    >
                      <option>Live</option>
                      <option>Down</option>
                      <option>Filtered</option>
                      <option>Pending</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-dim">Exploitability</label>
                    <select
                      value={exploitability}
                      onChange={(e) => setExploitability(e.target.value as Likelihood)}
                      className="rounded-md border border-white/10 bg-background px-3 py-1.5 text-xs outline-none focus:border-accent/40"
                    >
                      <option>None</option>
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-dim">Open Ports</label>
                    <input
                      type="text"
                      value={ports}
                      onChange={(e) => setPorts(e.target.value)}
                      placeholder="e.g. 80/tcp, 443/tcp"
                      className="rounded-md border border-white/10 bg-background px-3 py-1.5 font-mono text-xs outline-none focus:border-accent/40"
                    />
                  </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-dim">Services / Banner</label>
                  <input
                    type="text"
                    value={services}
                    onChange={(e) => setServices(e.target.value)}
                    placeholder="e.g. nginx, OpenSSH"
                    className="rounded-md border border-white/10 bg-background px-3 py-1.5 text-xs outline-none focus:border-accent/40"
                  />
                </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-dim">OS Guess</label>
                    <input
                      type="text"
                      value={osGuess}
                      onChange={(e) => setOsGuess(e.target.value)}
                      placeholder="e.g. Linux 5.x"
                      className="rounded-md border border-white/10 bg-background px-3 py-1.5 text-xs outline-none focus:border-accent/40"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-dim">Internal Notes</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notes on exposure, owner, or testing findings..."
                      className="rounded-md border border-white/10 bg-background px-3 py-1.5 text-xs outline-none focus:border-accent/40"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-dim">Audited By</label>
                    <input
                      type="text"
                      value={checkedBy}
                      onChange={(e) => setCheckedBy(e.target.value)}
                      placeholder="Analyst name / worker"
                      className="rounded-md border border-white/10 bg-background px-3 py-1.5 text-xs outline-none focus:border-accent/40"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                  >
                    {loading ? "Saving..." : "Save Asset Changes"}
                  </button>
                  {saved && <span className="text-xs text-emerald-400">Changes persisted to database</span>}
                </div>
              </form>

      {/* Asset Intelligence Navigation Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-white/5 pb-2 text-xs">
        {[
          ["history", `Risk & Snapshot History (${history.length})`],
          ["ports", "Port History & Changes"],
          ["tech", "Technology & Services"],
          ["graph", `Domain-IP Graph (${associatedDomains.length})`],
          ["scans", `Associated Scans (${scans.length})`],
          ["findings", `Findings (${findingsList.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === key
                ? "bg-accent/15 text-accent border border-accent/20"
                : "text-muted hover:text-foreground hover:bg-white/5"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: History and Risk Trend */}
      {activeTab === "history" && (
        <section className="card p-5">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div>
              <h3 className="text-sm font-semibold">Risk Score Progression &amp; Host Snapshots</h3>
              <p className="text-[11px] text-muted-dim">
                Automated database snapshots captured whenever open ports, services, or risk ratings change
              </p>
            </div>
            <span className="font-mono text-xs text-muted-dim">{history.length} snapshots</span>
          </div>

          <div className="mt-4 space-y-2 text-xs">
            {history.length ? (
              history.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-background/20 p-2.5 font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-dim">
                      {new Date(snapshot.captured_at).toLocaleString()}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-bold ${
                        snapshot.status === "Live"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-white/5 text-muted"
                      }`}
                    >
                      {snapshot.status ?? "unknown"}
                    </span>
                    <span className="text-foreground">
                      {snapshot.open_ports ? `Ports: ${snapshot.open_ports}` : "No open ports"}
                    </span>
                  </div>
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-accent font-bold">
                    Risk: {snapshot.risk_score ?? "—"}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-muted-dim">
                No history snapshots recorded yet. Apply migration 20261108001700 to enable snapshot triggers.
              </p>
            )}
          </div>
        </section>
      )}

                      {/* TAB 2: Port History */}
                      {activeTab === "ports" && (
                        <section className="card p-5">
                          <h3 className="text-sm font-semibold">Port History &amp; Service Disclosures</h3>
                          <p className="mt-1 text-[11px] text-muted-dim">
                            Historical port scan comparisons for {ip}
                          </p>

                          <div className="mt-4 space-y-3">
                            <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs">
                              <p className="font-semibold text-accent">Current Detected Ports</p>
                              <p className="mt-1 font-mono text-foreground">{ports || "None"}</p>
                              <p className="mt-1 text-muted-dim">{services || "No service details recorded"}</p>
                            </div>

                            <div className="space-y-2 text-xs">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-dim">
                                Snapshot Port History
                              </p>
                              {history.map((h) => (
                                <div
                                  key={h.id}
                                  className="rounded border border-white/5 bg-background/20 p-2 font-mono flex items-center justify-between"
                                >
                                  <span className="text-foreground">{h.open_ports || "No open ports"}</span>
                                  <span className="text-[10px] text-muted-dim">
                                    {new Date(h.captured_at).toLocaleDateString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </section>
                      )}

                      {/* TAB 3: Technology History */}
                      {activeTab === "tech" && (
                        <section className="card p-5">
                          <h3 className="text-sm font-semibold">Detected Technologies &amp; Fingerprints</h3>
                          <p className="mt-1 text-[11px] text-muted-dim">
                            Technologies observed across whatweb, wafw00f, and HTTP probes
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {(host.tech && host.tech.length ? host.tech : ["No technologies indexed"]).map((t) => (
              <span
                key={t}
                className="rounded-lg border border-white/10 bg-background/40 px-2.5 py-1 font-mono text-xs text-foreground"
              >
                { t }
              </span>
            ))}
                        </div>

          {host.waf && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
              <span className="font-bold text-amber-300">Web Application Firewall (WAF):</span>{" "}
              <span className="font-mono text-foreground">{host.waf}</span>
            </div>
                      )}
        </section>
      )}

                  {/* TAB 4: Domain-to-IP Relationship Graph */}
                  {activeTab === "graph" && (
                    <section className="card p-5">
                      <h3 className="text-sm font-semibold">Domain-to-IP Relationship Graph</h3>
                      <p className="mt-1 text-[11px] text-muted-dim">
                        Subdomains, hostnames, and virtual hosts mapped to {ip}
                      </p>

                      <div className="mt-4 rounded-xl border border-white/5 bg-black/40 p-4">
                        <div className="flex flex-col items-center gap-4 text-xs font-mono">
                          {/* Apex Target Domain Node */}
                          <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-accent font-bold">
                            Target Apex: {target?.domain ?? target?.name ?? "example.com"}
                          </div>

                          <div className="h-6 w-0.5 bg-white/20" />

                          {/* Host IP Node */}
                          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-emerald-300 font-bold">
                            Host IP: {ip} {host.hostname ? `(${host.hostname})` : ""}
                          </div>

                          <div className="h-6 w-0.5 bg-white/20" />

                          {/* Subdomains Nodes */}
                          <div className="flex flex-wrap justify-center gap-2">
                            {associatedDomains.length ? (
                              associatedDomains.map((s) => (
                                <div
                                  key={s.id}
                                  className="rounded border border-white/10 bg-background/50 px-3 py-1.5 text-[11px] text-muted"
                                >
                                  {s.subdomain}
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-muted-dim font-sans">
                                No directly mapped subdomains found for this IP.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* TAB 5: Associated Scans */}
                  {activeTab === "scans" && (
                    <section className="card p-5">
                      <h3 className="text-sm font-semibold">Target Recon Scans</h3>
                      <p className="mt-1 text-[11px] text-muted-dim">
                        Recent reconnaissance scans executed against {target?.name ?? "this asset"}
                      </p>

                      <div className="mt-4 space-y-2 text-xs">
                        {scans.length ? (
                          scans.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between rounded-lg border border-white/5 bg-background/20 p-2.5"
                            >
                              <div className="flex items-center gap-2 font-mono">
                                <a href={`/scans/${s.id}`} className="font-semibold text-accent hover:underline">
                                  {s.input}
                                </a>
                                <span className="text-muted-dim">({s.mode})</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="capitalize text-muted">{s.status}</span>
                                <span className="text-muted-dim">
                                  {new Date(s.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-dim">No scans recorded for this target.</p>
                        )}
                        </div>
                    </section>
                  )}

                  {/* TAB 6: Findings */}
                  {activeTab === "findings" && (
                    <div className="border-t border-white/6 pt-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium">
                          Vulnerability Findings
                          {findingsList.length > 0 && (
                            <span className="ml-1.5 text-muted">({findingsList.length})</span>
                          )}
                        </h2>
                        {!fAdding && (
              <button
                type="button"
                onClick={() => setFAdding(true)}
                className="rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
              >
                + Add Finding
              </button>
            )}
                </div>

          {fAdding && (
                            <form
                              onSubmit={handleAddFinding}
                              className="mt-3 flex flex-col gap-3 rounded-lg border border-accent/20 bg-surface p-4 text-xs"
                            >
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <input
                                  type="text"
                                  value={fTitle}
                                  onChange={(e) => setFTitle(e.target.value)}
                                  placeholder="Finding title *"
                                  autoFocus
                                  className="rounded-md border border-white/10 bg-background px-3 py-2 text-xs outline-none focus:border-accent/40"
                                />
                                <input
                                  type="text"
                                  value={fType}
                                  onChange={(e) => setFType(e.target.value)}
                                  placeholder="Type (XSS, SQLi, Port, Header...)"
                                  className="rounded-md border border-white/10 bg-background px-3 py-2 text-xs outline-none focus:border-accent/40"
                                />
                                <select
                                  value={fSeverity}
                                  onChange={(e) => setFSeverity(e.target.value as Severity)}
                                  className="rounded-md border border-white/10 bg-background px-3 py-2 text-xs"
                                >
                                  <option>Info</option>
                                  <option>Low</option>
                                  <option>Medium</option>
                                  <option>High</option>
                                  <option>Critical</option>
                                </select>
                                <select
                                  value={fStatus}
                                  onChange={(e) => setFStatus(e.target.value as FindingStatus)}
                                  className="rounded-md border border-white/10 bg-background px-3 py-2 text-xs"
                                >
                                  <option>New</option>
                                  <option>Confirmed</option>
                                  <option>Reported</option>
                                  <option>Fixed</option>
                                  <option>False Positive</option>
                                </select>
                              </div>

                              <textarea
                                value={fEvidence}
                                onChange={(e) => setFEvidence(e.target.value)}
                                placeholder="Evidence / PoC"
                                rows={2}
                                className="rounded-md border border-white/10 bg-background px-3 py-2 font-mono text-xs"
                              />
                              <textarea
                                value={fRemediation}
                                onChange={(e) => setFRemediation(e.target.value)}
                                placeholder="Remediation steps"
                                rows={2}
                                className="rounded-md border border-white/10 bg-background px-3 py-2 text-xs"
                              />

                              {fError && <p className="text-xs text-red-400">{fError}</p>}

                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  disabled={fLoading}
                                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                                >
                                  {fLoading ? "Adding..." : "Add Finding"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFAdding(false)}
                                  className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted hover:text-foreground"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          )}

                          {sortedFindings.length > 0 ? (
                            <div className="mt-3 flex flex-col gap-1.5">
                              {sortedFindings.map((f) => (
                                <div
                                  key={f.id}
                                  className="group flex flex-col gap-1 rounded-lg border border-white/5 bg-background/20 px-4 py-3 transition-colors hover:border-white/10 sm:flex-row sm:items-center sm:gap-4"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-foreground">{f.title}</span>
                                      {f.type && (
                                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
                                          {f.type}
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-0.5 flex gap-x-3 text-[10px] text-muted-dim">
                                      <span>Status: {f.status}</span>
                                      {f.found_by && <span>by {f.found_by}</span>}
                                    </div>
                                    {f.evidence && (
                                      <p className="mt-1 font-mono text-[10px] text-muted line-clamp-2">
                                        {f.evidence}
                                      </p>
                                    )}
                                  </div>
                                    <div className="flex items-center gap-2">
                                      <SeverityBadge value={f.severity} />
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteFinding(f.id)}
                                        disabled={deletingId === f.id}
                                        className="rounded p-1 text-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                                        title="Delete finding"
                                      >
                                        {deletingId === f.id ? "..." : "🗑"}
                                      </button>
                                    </div>
                                  </div>
              ))}
                      </div>
                      ) : (
                      !fAdding && (
                      <p className="mt-3 text-xs text-muted">No findings recorded for this host yet.</p>
                      )
          )}
                    </div>
                  )}
                </div>
              );
}
