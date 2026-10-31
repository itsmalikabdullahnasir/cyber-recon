"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Finding, Host, ModuleRegistry, PipelineModule, PipelineProfile, Scan, ScopeEntry, Subdomain, Target } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { ScopeManager } from "@/components/ScopeManager";
import { ReconResults } from "@/components/ReconResults";
import { ScanRow } from "@/components/ScanRow";

type Mode = "passive" | "full";
type GroupLite = Pick<Target, "id" | "name" | "category"> & { is_console?: boolean };

export function ConsoleClient({
  consoleTargetId,
  userEmail,
  groups,
  scopeEntries: scopeInit,
  initialScans,
  subdomains: subsInit,
  hosts: hostsInit,
  findings: findingsInit,
}: {
  consoleTargetId: string;
  userEmail: string;
  groups: GroupLite[];
  scopeEntries: ScopeEntry[];
  initialScans: Scan[];
  subdomains: Subdomain[];
  hosts: Host[];
  findings: Finding[];
}) {
  const [groupId, setGroupId] = useState(consoleTargetId);
  const [newGroup, setNewGroup] = useState("");
  const [groupList, setGroupList] = useState<GroupLite[]>(groups);

  const [input, setInput] = useState("");
  const [bulk, setBulk] = useState(false);
  const [mode, setMode] = useState<Mode>("passive");
  const [authorized, setAuthorized] = useState(false);
  const [pipelineRegistry, setPipelineRegistry] = useState<ModuleRegistry | null>(null);
  const [pipelineProfiles, setPipelineProfiles] = useState<PipelineProfile[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState("builtin:basic_passive");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [scopeEntries, setScopeEntries] = useState<ScopeEntry[]>(scopeInit);
  const [scans, setScans] = useState<Scan[]>(initialScans);
  const [subs, setSubs] = useState<Subdomain[]>(subsInit);
  const [hosts, setHosts] = useState<Host[]>(hostsInit);
  const [finds, setFinds] = useState<Finding[]>(findingsInit);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const scanStatus = useRef<Map<string, string>>(new Map(initialScans.map((s) => [s.id, s.status])));

  useEffect(() => {
    Promise.all([fetch("/api/modules"), fetch("/api/pipelines")])
      .then(async ([modulesRes, profilesRes]) => {
        if (!modulesRes.ok || !profilesRes.ok) throw new Error("Could not load scan pipelines");
        const [modules, profiles] = await Promise.all([modulesRes.json(), profilesRes.json()]);
        setPipelineRegistry(modules);
        setPipelineProfiles(profiles.profiles ?? []);
      })
      .catch(() => setNotice({ kind: "err", text: "Could not load scan pipelines" }));
  }, []);

  const selectedPipelineData = useMemo(() => {
    if (selectedPipeline.startsWith("builtin:")) {
      const key = selectedPipeline.slice("builtin:".length);
      const profile = pipelineRegistry?.profiles?.[key];
      return profile ? { name: profile.name, description: profile.description, modules: profile.modules.map((id) => ({ id, enabled: true })), profileId: null } : null;
    }
    const profile = pipelineProfiles.find((p) => p.id === selectedPipeline);
    return profile ? { name: profile.name, description: profile.description, modules: profile.modules, profileId: profile.id } : null;
  }, [pipelineProfiles, pipelineRegistry, selectedPipeline]);

  const pipelineModuleNames = useMemo(() => {
    const names = new Map((pipelineRegistry?.modules ?? []).map((m) => [m.id, m.name]));
    return selectedPipelineData?.modules.filter((m) => m.enabled).map((m) => names.get(m.id) ?? m.id) ?? [];
  }, [pipelineRegistry, selectedPipelineData]);

  function chooseMode(next: Mode) {
    setMode(next);
    setSelectedPipeline(next === "passive" ? "builtin:basic_passive" : "builtin:basic_full");
  }

  function choosePipeline(value: string) {
    setSelectedPipeline(value);
    const modules = value.startsWith("builtin:")
      ? pipelineRegistry?.profiles?.[value.slice("builtin:".length)]?.modules ?? []
      : pipelineProfiles.find((p) => p.id === value)?.modules.map((m) => m.id) ?? [];
    const active = (pipelineRegistry?.modules ?? []).some((m) => modules.includes(m.id) && m.tier === "active");
    setMode(active ? "full" : "passive");
  }

  const refreshPending = useCallback(async (id: string) => {
    const supabase = createClient();
    const [pend, fail] = await Promise.all([
      supabase.from("scans").select("id", { count: "exact", head: true }).eq("target_id", id).in("status", ["queued", "running"]),
      supabase.from("scans").select("id", { count: "exact", head: true }).eq("target_id", id).eq("status", "failed"),
    ]);
    setPending(pend.count ?? 0);
    setFailed(fail.count ?? 0);
  }, []);

  const loadFor = useCallback(async (id: string) => {
    const supabase = createClient();
    const [sc, sd, h, f, scp] = await Promise.all([
      supabase.from("scans").select("*").eq("target_id", id).order("created_at", { ascending: false }).limit(25),
      supabase.from("subdomains").select("*").eq("target_id", id).order("created_at", { ascending: false }),
      supabase.from("hosts").select("*").eq("target_id", id),
      supabase.from("findings").select("*").eq("target_id", id).order("created_at", { ascending: false }),
      supabase.from("scope_entries").select("*").eq("target_id", id).order("created_at", { ascending: true }),
    ]);
    setScans(sc.data ?? []);
    setSubs(sd.data ?? []);
    setHosts(h.data ?? []);
    setFinds(f.data ?? []);
    setScopeEntries(scp.data ?? []);
    scanStatus.current = new Map((sc.data ?? []).map((s) => [s.id, s.status]));
    refreshPending(id);
  }, [refreshPending]);

  const loadResults = useCallback(async (id: string) => {
    const supabase = createClient();
    const [sd, h, f] = await Promise.all([
      supabase.from("subdomains").select("*").eq("target_id", id).order("created_at", { ascending: false }),
      supabase.from("hosts").select("*").eq("target_id", id),
      supabase.from("findings").select("*").eq("target_id", id).order("created_at", { ascending: false }),
    ]);
    setSubs(sd.data ?? []);
    setHosts(h.data ?? []);
    setFinds(f.data ?? []);
  }, []);

  // When the selected group changes (and isn't the initial default), load it.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    loadFor(groupId);
  }, [groupId, loadFor]);

  // Live scans for the selected group; reload results when a scan finishes.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`console:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scans", filter: `target_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as Scan;
          const prev = scanStatus.current.get(row.id);
          scanStatus.current.set(row.id, row.status);
          setScans((p) =>
            [row, ...p.filter((s) => s.id !== row.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 25),
          );
          if (prev !== row.status && (row.status === "done" || row.status === "running" || row.status === "failed")) {
            loadResults(groupId);
          }
          refreshPending(groupId);
        },
      )
      .subscribe();
    const t = setTimeout(() => refreshPending(groupId), 0);
    return () => {
      clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [groupId, loadResults, refreshPending]);

  const parsed = useMemo(() => parseInput(input), [input]);
  const importable = useMemo(() => parseImport(input), [input]);

  async function ensureGroup(): Promise<string | null> {
    if (groupId !== "__new__") return groupId;
    const name = newGroup.trim();
    if (!name) {
      setNotice({ kind: "err", text: "Enter a group name" });
      return null;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("targets")
      .insert({ name, category: "Engagement", scope: "In Scope", status: "Recon" })
      .select("id, name, category")
      .single();
    if (error || !data) {
      setNotice({ kind: "err", text: error?.message ?? "Could not create group" });
      return null;
    }
    setGroupList((g) => [{ ...data }, ...g]);
    setNewGroup("");
    setGroupId(data.id);
    return data.id;
  }

  async function launch() {
    if (parsed.length === 0) {
      setNotice({ kind: "err", text: "Enter at least one IP or domain" });
      return;
    }
    setNotice(null);
    setBusy(true);
    try {
      const target = await ensureGroup();
      if (!target) return;
      const batch = parsed.slice(0, 50);
      // Warn about targets that already have a scan in this group — but allow continuing.
      const dupes = batch.filter((t) => scans.some((s) => s.input === t));
      if (
        dupes.length &&
        !confirm(
          `${dupes.length} of these already have a scan: ${dupes.slice(0, 6).join(", ")}${dupes.length > 6 ? ", …" : ""}.\n\nRun them again anyway?`,
        )
      ) {
        return;
      }
      const res = await fetch("/api/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          targets: batch,
          group_id: target,
          authorize: authorized,
          profile_id: selectedPipelineData?.profileId ?? null,
          pipeline: selectedPipelineData?.modules ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ kind: "err", text: data.detail ? `${data.error}: ${data.detail}` : data.error || "Scan request failed" });
      } else {
        const refused = (data.results ?? []).filter((r: { status: string }) => r.status !== "accepted");
        const parts = [`${data.accepted}/${data.total} scan(s) queued`];
        if (parsed.length > 50) parts.push(`(first 50 of ${parsed.length.toLocaleString()} — Import the rest)`);
        refused.slice(0, 5).forEach((r: { target: string; error?: string }) => parts.push(`✗ ${r.target}: ${r.error}`));
        setNotice({ kind: data.accepted > 0 ? "ok" : "err", text: parts.join(" · ") });
        if (data.accepted > 0) setInput("");
      }
    } catch {
      setNotice({ kind: "err", text: "Could not reach the app server" });
    } finally {
      setBusy(false);
    }
  }

  async function runImport(scanAfter: boolean) {
    if (!importable) return;
    setNotice(null);
    setBusy(true);
    try {
      const target = await ensureGroup();
      if (!target) return;
      const supabase = createClient();
      const [{ data: exSubs }, { data: exHosts }] = await Promise.all([
        supabase.from("subdomains").select("name").eq("target_id", target),
        supabase.from("hosts").select("ip").eq("target_id", target),
      ]);
      const haveNames = new Set((exSubs ?? []).map((s) => s.name.toLowerCase()));
      const haveIps = new Set((exHosts ?? []).map((h) => h.ip));
      const subRows: Record<string, unknown>[] = [];
      const hostRows: Record<string, unknown>[] = [];
      for (const it of importable) {
        if (haveNames.has(it.name)) continue;
        haveNames.add(it.name);
        subRows.push({
          target_id: target, name: it.name, ip: it.ip, resolved_ips: it.ip ? [it.ip] : null,
          is_cdn: it.cdn, cdn_name: it.cdn ? "Cloudflare" : null,
          status: it.ip ? "Active" : "Unknown", discovered_by: "import",
        });
        if (it.ip && !haveIps.has(it.ip)) {
          haveIps.add(it.ip);
          hostRows.push({
            target_id: target, ip: it.ip, status: "Live", is_cdn: it.cdn,
            cdn_name: it.cdn ? "Cloudflare" : null, hostname: it.name, checked_by: "import",
          });
        }
      }
      const skipped = importable.length - subRows.length;
      const newNames = subRows.map((r) => r.name as string);
      for (let i = 0; i < subRows.length; i += 500) {
        await supabase.from("subdomains").insert(subRows.slice(i, i + 500));
        setNotice({ kind: "ok", text: `Importing… ${Math.min(i + 500, subRows.length)} / ${subRows.length}` });
      }
      for (let i = 0; i < hostRows.length; i += 500) await supabase.from("hosts").insert(hostRows.slice(i, i + 500));

      let queued = 0;
      if (scanAfter && newNames.length) {
        const scanRows = newNames.map((n) => ({
          target_id: target, input: n, mode: "enrich", status: "queued", requested_by_email: userEmail,
        }));
        for (let i = 0; i < scanRows.length; i += 500) {
          await supabase.from("scans").insert(scanRows.slice(i, i + 500));
          setNotice({ kind: "ok", text: `Queueing scans… ${Math.min(i + 500, scanRows.length)} / ${scanRows.length}` });
        }
        queued = scanRows.length;
        await refreshPending(target);
      }

      await loadFor(target);
      const parts = [`Imported ${subRows.length} new`];
      if (skipped > 0) parts.push(`${skipped} already present (skipped)`);
      if (queued > 0) parts.push(`${queued} enrich scans queued — running one at a time`);
      setNotice({ kind: "ok", text: parts.join(" · ") });
      setInput("");
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setBusy(false);
    }
  }

  async function scanAllInGroup() {
    setNotice(null);
    setBusy(true);
    try {
      // Everything scannable in this group: each resolving subdomain, plus
      // bare hosts (IP-only rows from imports) that have no subdomain.
      const names = new Set<string>();
      for (const s of subs) names.add(s.name);
      const subIps = new Set(subs.map((s) => s.ip).filter(Boolean));
      for (const h of hosts) if (!subIps.has(h.ip)) names.add(h.ip);
      const targets = [...names];
      if (targets.length === 0) {
        setNotice({ kind: "err", text: "Nothing to scan in this group yet — import or add hosts first." });
        return;
      }
      const supabase = createClient();
      const rows = targets.map((t) => ({
        target_id: groupId, input: t, mode: "enrich", status: "queued", requested_by_email: userEmail,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from("scans").insert(rows.slice(i, i + 500));
        setNotice({ kind: "ok", text: `Queueing… ${Math.min(i + 500, rows.length)} / ${rows.length}` });
      }
      await refreshPending(groupId);
      await loadFor(groupId);
      setNotice({ kind: "ok", text: `Queued ${rows.length} fast enrich scans. They run one at a time — leave it; you'll get a notification per host.` });
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "Could not queue scans" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup() {
    if (groupId === consoleTargetId || groupId === "__new__") return;
    const g = groupList.find((x) => x.id === groupId);
    if (!confirm(`Delete group "${g?.name ?? "this group"}" and ALL its hosts, subdomains, findings and scans? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.from("scans").update({ status: "failed", error: "group deleted" }).eq("target_id", groupId).eq("status", "queued");
      await supabase.from("targets").delete().eq("id", groupId); // cascades to hosts/subdomains/findings/scans/scope
      setGroupList((list) => list.filter((x) => x.id !== groupId));
      setGroupId(consoleTargetId);
      setNotice({ kind: "ok", text: `Group "${g?.name ?? ""}" deleted.` });
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "Could not delete group" });
    } finally {
      setBusy(false);
    }
  }

  async function stopQueue() {
    setBusy(true);
    try {
      const supabase = createClient();
      // Cancel queued AND the running scan. The worker checks the row status at
      // each stage boundary and aborts the one in progress.
      await supabase
        .from("scans")
        .update({ status: "failed", error: "cancelled by user" })
        .eq("target_id", groupId)
        .in("status", ["queued", "running"]);
      await refreshPending(groupId);
      await loadFor(groupId);
      setNotice({ kind: "ok", text: "Stopping — pending cancelled; the running scan stops at its next stage." });
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "Could not stop the queue" });
    } finally {
      setBusy(false);
    }
  }

  async function reRunFailed() {
    setBusy(true);
    try {
      const supabase = createClient();
      // Resume unfinished/failed scans: re-queue them (poller re-runs in order).
      await supabase
        .from("scans")
        .update({ status: "queued", error: null, finished_at: null, started_at: null, stage: null, stages: {} })
        .eq("target_id", groupId)
        .eq("status", "failed");
      await refreshPending(groupId);
      await loadFor(groupId);
      setNotice({ kind: "ok", text: "Re-queued failed scans — they resume one at a time." });
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "Could not re-run failed scans" });
    } finally {
      setBusy(false);
    }
  }

  const locked = pending > 0;
  const scannableCount = useMemo(() => {
    const names = new Set<string>();
    for (const s of subs) names.add(s.name);
    const subIps = new Set(subs.map((s) => s.ip).filter(Boolean));
    for (const h of hosts) if (!subIps.has(h.ip)) names.add(h.ip);
    return names.size;
  }, [subs, hosts]);

  const activeScan = scans.find((s) => s.status === "queued" || s.status === "running");
  const selectableGroups = groupList.filter((g) => g.id !== consoleTargetId);
  const assignTargets = groupList.filter((g) => !g.is_console && g.id !== groupId);

  return (
    <div className="flex flex-col gap-5">
      {/* Destination group */}
      <div className="card p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Engagement group</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-lg border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
          >
            <option value={consoleTargetId}>🛰️ Scan Console (default)</option>
            {selectableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value="__new__">➕ New group…</option>
          </select>
          {groupId === "__new__" && (
            <input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="e.g. Bahria University"
              className="rounded-lg border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
          )}
          {groupId !== consoleTargetId && groupId !== "__new__" && (
            <button
              onClick={deleteGroup}
              disabled={busy}
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
            >
              🗑 Delete group
            </button>
          )}
          <span className="text-[11px] text-muted-dim">
            Results land in this group and appear on the dashboard with risk analysis.
          </span>
        </div>
      </div>

      {/* Queue lock banner */}
      {locked && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <svg className="h-4 w-4 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div className="flex-1 text-xs text-amber-200">
            <b>Queue running — {pending.toLocaleString()} scan{pending === 1 ? "" : "s"} remaining.</b>{" "}
            Scans run one at a time on the VM. You can keep using the app and get a notification as each host completes.
          </div>
          <button
            onClick={stopQueue}
            disabled={busy}
            className="shrink-0 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
          >
            ■ Stop queue
          </button>
        </div>
      )}

      {/* Launcher */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">New scan</h2>
            <p className="text-[11px] text-muted-dim">
              One IP/domain or many. Paste your JSON to <span className="text-accent">import</span> without scanning.
            </p>
          </div>
          <button onClick={() => setBulk((b) => !b)} className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-foreground">
            {bulk ? "Single" : "Bulk / JSON"}
          </button>
        </div>

        {bulk ? (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
            placeholder={'Lines, or JSON:\n["example.com","203.0.113.10"]\nImport shape:\n[{"subdomain":"a.edu.pk","ip":"104.26.11.160","cloudflare":"true"}]'}
            className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent/40"
          />
        ) : (
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="example.com  or  203.0.113.10"
            className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-accent/40"
          />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="seg">
            <button onClick={() => chooseMode("passive")} className="seg-item" data-active={mode === "passive"}>Passive</button>
            <button onClick={() => chooseMode("full")} className="seg-item" data-active={mode === "full"}>Full (active)</button>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <span>Pipeline</span>
            <select
              value={selectedPipeline}
              onChange={(e) => choosePipeline(e.target.value)}
              className="max-w-[230px] rounded-md border border-white/10 bg-background px-2 py-1.5 text-[11px] outline-none focus:border-accent/40"
            >
              {pipelineRegistry && Object.entries(pipelineRegistry.profiles).map(([key, profile]) => (
                <option key={`builtin:${key}`} value={`builtin:${key}`}>{profile.name}</option>
              ))}
              {pipelineProfiles.length > 0 && <option disabled>──────── Saved pipelines ────────</option>}
              {pipelineProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </label>
          <button
            onClick={launch}
            disabled={busy || locked || parsed.length === 0 || (mode === "full" && !authorized)}
            className="btn btn-accent"
          >
            {busy ? "Working…" : `Run ${Math.min(parsed.length, 50) || ""} scan${Math.min(parsed.length, 50) === 1 ? "" : "s"}`}
          </button>
          {importable && (
            <>
              <button onClick={() => runImport(true)} disabled={busy || locked} className="btn btn-accent" title="Load these hosts and queue a passive scan for each new one">
                ⚡ Import &amp; scan {importable.length.toLocaleString()}
              </button>
              <button onClick={() => runImport(false)} disabled={busy} className="btn" title="Just load the hosts, don't scan">
                ⬇ Import {importable.length.toLocaleString()} (no scan)
              </button>
            </>
          )}
          {scannableCount > 0 && (
            <button onClick={scanAllInGroup} disabled={busy || locked} className="btn" title="Queue a passive scan for every host in this group">
              ⚡ Scan all {scannableCount.toLocaleString()} in group
            </button>
          )}
          {activeScan && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400 text-amber-400" />
              {activeScan.status === "queued" ? "Queued…" : `Running ${activeScan.input}: ${activeScan.stage ?? "starting"}`}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-dim">
          <span>{selectedPipelineData?.name ?? (mode === "passive" ? "Passive" : "Full")}:</span>
          <span>{pipelineModuleNames.length ? pipelineModuleNames.join(" → ") : "Loading pipeline modules…"}</span>
        </div>

        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] text-muted-dim hover:text-foreground">
            <span className="transition-transform group-open:rotate-90">▸</span> What do the scan modes mean?
          </summary>
          <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-[11px] text-muted">
            <p><span className="font-semibold text-indigo-300">Passive</span> — read-only recon: finds subdomains, resolves DNS, probes HTTP, fingerprints the tech stack, and matches known CVEs by version. Safe on anything.</p>
            <p><span className="font-semibold text-accent">Enrich</span> — a faster Passive for hosts you already have (used by bulk Import &amp; Scan). Skips subdomain discovery and just enriches each host: DNS + HTTP + tech + CVE. ~3s each instead of ~30s.</p>
            <p><span className="font-semibold text-rose-300">Full</span> — uses the selected pipeline and may include active attacks such as nmap, TLS audit, directory brute-force, and nuclei. Requires the authorization checkbox.</p>
          </div>
        </details>

        {mode === "full" && (
          <label className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-200">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold">I&apos;m authorized to actively test the targets I enter.</span>{" "}
              Full scans run real attacks (nmap, directory brute-force, nuclei). Tick this and it scans exactly what you type —
              no allowlist setup needed. Only scan systems you have permission to test.
            </span>
          </label>
        )}

        {parsed.length > 50 && (
          <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-300">
            That&apos;s <b>{parsed.length.toLocaleString()}</b> targets. Scanning runs one at a time on your VM, so it&apos;s
            capped at <b>50 per batch</b>. For a big list like this, click{" "}
            {importable ? <b>⬇ Import {importable.length.toLocaleString()} hosts</b> : <b>Import</b>} to load them instantly,
            then scan the ones you care about (select rows → or run a smaller batch).
          </div>
        )}
        {notice && (
          <div className={`mt-2 flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-[11px] ${notice.kind === "ok" ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-300" : "border-rose-500/20 bg-rose-500/8 text-rose-300"}`}>
            {notice.text.split(" · ").map((line, i) => <span key={i}>{line}</span>)}
          </div>
        )}
      </div>

      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] text-muted-dim hover:text-foreground">
          <span className="transition-transform group-open:rotate-90">▸</span>
          Authorized scope (optional — auto-filled when you tick “I’m authorized”)
        </summary>
        <div className="mt-2">
          <ScopeManager key={groupId} targetId={groupId} entries={scopeEntries} />
        </div>
      </details>

      {/* Live scans */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Scan activity {scans.length > 0 && <span className="text-muted-dim">({scans.length})</span>}</h2>
            {failed > 0 && (
              <button
                onClick={reRunFailed}
                disabled={busy}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                title="Re-queue failed/unfinished scans and resume them"
              >
                ↻ Re-run {failed.toLocaleString()} failed
              </button>
            )}
          </div>
          <div className="flex gap-1.5 text-[10px]">
            {([
              ["running", "Running", "border-amber-500/30 bg-amber-500/10 text-amber-300"],
              ["queued", "Queued", "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"],
              ["done", "Done", "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"],
              ["failed", "Failed", "border-rose-500/30 bg-rose-500/10 text-rose-300"],
            ] as const).map(([key, label, cls]) => (
              <span key={key} className={`rounded-md border px-2 py-0.5 font-medium ${cls}`}>
                {scans.filter((s) => s.status === key).length} {label}
              </span>
            ))}
          </div>
        </div>
        {scans.length === 0 ? (
          <p className="card p-4 text-center text-xs text-muted-dim">No scans in this group yet.</p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {scans.slice(0, 8).map((s) => <ScanRow key={s.id} scan={s} />)}
          </div>
        )}
      </div>

      {/* Results */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Results</h2>
        <ReconResults
          subdomains={subs}
          hosts={hosts}
          findings={finds}
          assignTargets={assignTargets}
          onAssigned={() => loadResults(groupId)}
        />
      </div>
    </div>
  );
}

// Targets to scan (recognizes subdomain/domain/ip/host/target keys).
function parseInput(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith("[") || t.startsWith("{")) {
    try {
      const data = JSON.parse(t);
      const arr = Array.isArray(data) ? data : [data];
      const out: string[] = [];
      for (const it of arr) {
        if (typeof it === "string") out.push(it.trim());
        else if (it && typeof it === "object") {
          const v = it.subdomain ?? it.domain ?? it.host ?? it.target ?? it.ip;
          if (typeof v === "string") out.push(v.trim());
        }
      }
      return [...new Set(out.filter(Boolean))];
    } catch {
      /* fall through */
    }
  }
  return [...new Set(t.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

// Import shape: [{subdomain, ip, cloudflare}]. Returns null if it isn't that.
function parseImport(text: string): { name: string; ip: string | null; cdn: boolean }[] | null {
  const t = text.trim();
  if (!t.startsWith("[") && !t.startsWith("{")) return null;
  try {
    const data = JSON.parse(t);
    const arr = Array.isArray(data) ? data : [data];
    const out: { name: string; ip: string | null; cdn: boolean }[] = [];
    for (const it of arr) {
      if (!it || typeof it !== "object") continue;
      const name = String(it.subdomain ?? it.domain ?? it.host ?? "").trim().toLowerCase();
      if (!name) continue;
      const ipRaw = String(it.ip ?? "").trim();
      const ip = /^[0-9.]+$/.test(ipRaw) || ipRaw.includes(":") ? ipRaw : null;
      const cdn = it.cloudflare === true || it.cloudflare === "true" || it.cdn === true;
      out.push({ name, ip, cdn });
    }
    // Only treat as "import" if at least one row carries an IP (i.e. recon data, not bare targets).
    return out.length && out.some((r) => r.ip) ? out : null;
  } catch {
    return null;
  }
}
