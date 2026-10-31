"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EngagementGroupMember, Finding, Host, ModuleRegistry, PipelineModule, PipelineProfile, Scan, ScopeEntry, Subdomain, Target } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { ScopeManager } from "@/components/ScopeManager";
import { ReconResults } from "@/components/ReconResults";
import { ScanRow } from "@/components/ScanRow";
import { parseTarget } from "@/lib/target";

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
  members: membersInit,
  initialMemberCount,
}: {
  consoleTargetId: string;
  userEmail: string;
  groups: GroupLite[];
  scopeEntries: ScopeEntry[];
  initialScans: Scan[];
  subdomains: Subdomain[];
  hosts: Host[];
  findings: Finding[];
  members: EngagementGroupMember[];
  initialMemberCount: number;
}) {
  const [groupId, setGroupId] = useState(consoleTargetId);
  const [newGroup, setNewGroup] = useState("");
  const [groupList, setGroupList] = useState<GroupLite[]>(groups);

  const [input, setInput] = useState("");
  const [bulk, setBulk] = useState(false);
  const [pipelineRegistry, setPipelineRegistry] = useState<ModuleRegistry | null>(null);
  const [pipelineProfiles, setPipelineProfiles] = useState<PipelineProfile[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState("builtin:basic_passive");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [scopeActionBusy, setScopeActionBusy] = useState(false);

  const [scopeEntries, setScopeEntries] = useState<ScopeEntry[]>(scopeInit);
  const [scans, setScans] = useState<Scan[]>(initialScans);
  const [subs, setSubs] = useState<Subdomain[]>(subsInit);
  const [hosts, setHosts] = useState<Host[]>(hostsInit);
  const [finds, setFinds] = useState<Finding[]>(findingsInit);
  const [members, setMembers] = useState<EngagementGroupMember[]>(membersInit);
  const [memberCount, setMemberCount] = useState(initialMemberCount);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberHasMore, setMemberHasMore] = useState(membersInit.length < initialMemberCount);
  const [selectAllMembers, setSelectAllMembers] = useState(false);
  const [excludedMembers, setExcludedMembers] = useState<Set<string>>(new Set());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const [statusCounts, setStatusCounts] = useState({ queued: null as number | null, running: null as number | null, done: null as number | null, failed: null as number | null, total: null as number | null });
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [scanListError, setScanListError] = useState<string | null>(null);
  const [loadingMoreScans, setLoadingMoreScans] = useState(false);
  const [visibleScans, setVisibleScans] = useState(8);
  const [resultsHasMore, setResultsHasMore] = useState(false);
  const scanStatus = useRef<Map<string, string>>(new Map(initialScans.map((s) => [s.id, s.status])));
  const liveRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const selectedMode: Mode = useMemo(() => {
    const active = selectedPipelineData?.modules.some((module) =>
      module.enabled && pipelineRegistry?.modules.some((definition) => definition.id === module.id && definition.tier === "active"),
    );
    return active ? "full" : "passive";
  }, [pipelineRegistry, selectedPipelineData]);

  const workflowRisk = selectedMode === "full" ? "High" : "Low";

  function chooseWorkflow(value: string) {
    setSelectedPipeline(value);
  }

  const refreshPending = useCallback(async (id: string) => {
    setStatusLoading(true);
    const supabase = createClient();
    const statuses = await Promise.all(["queued", "running", "done", "failed"].map((status) =>
      supabase.from("scans").select("id", { count: "exact", head: true }).eq("target_id", id).eq("status", status),
    ));
    const error = statuses.find((result) => result.error)?.error?.message ?? null;
    if (error) {
      setStatusError(error);
      setStatusLoading(false);
      return;
    }
    const counts = {
      queued: statuses[0].count ?? 0,
      running: statuses[1].count ?? 0,
      done: statuses[2].count ?? 0,
      failed: statuses[3].count ?? 0,
    };
    setStatusCounts({ ...counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) });
    setPending(counts.queued + counts.running);
    setFailed(counts.failed);
    setStatusError(null);
    setStatusLoading(false);
  }, []);

  const loadFor = useCallback(async (id: string) => {
    const supabase = createClient();
    const [sc, sd, h, f, scp, gm, gmc] = await Promise.all([
      supabase.from("scans").select("*").eq("target_id", id).order("created_at", { ascending: false }).range(0, 24),
      supabase.from("subdomains").select("*").eq("target_id", id).order("created_at", { ascending: false }).range(0, 199),
      supabase.from("hosts").select("*").eq("target_id", id).range(0, 199),
      supabase.from("findings").select("*").eq("target_id", id).order("created_at", { ascending: false }).range(0, 199),
      supabase.from("scope_entries").select("*").eq("target_id", id).order("created_at", { ascending: true }),
      supabase.from("engagement_group_members").select("*").eq("group_id", id).order("created_at", { ascending: false }).range(0, 199),
      supabase.from("engagement_group_members").select("id", { count: "exact", head: true }).eq("group_id", id),
    ]);
    setScans(sc.data ?? []);
    setScanListError(sc.error?.message ?? null);
    setVisibleScans(8);
    setSubs(sd.data ?? []);
    setHosts(h.data ?? []);
    setFinds(f.data ?? []);
    setResultsHasMore([sd.data, h.data, f.data].some((rows) => (rows?.length ?? 0) === 200));
    setScopeEntries(scp.data ?? []);
    setMembers(gm.data ?? []);
    setMemberCount(gmc.count ?? 0);
    setMemberHasMore((gm.data?.length ?? 0) < (gmc.count ?? 0));
    setMemberError(gm.error?.message ?? gmc.error?.message ?? null);
    setSelectAllMembers(false);
    setExcludedMembers(new Set());
    setSelectedMembers(new Set());
    scanStatus.current = new Map((sc.data ?? []).map((s) => [s.id, s.status]));
    await refreshPending(id);
  }, [refreshPending]);

  const loadMoreMembers = async () => {
    if (memberLoading || !memberHasMore) return;
    setMemberLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("engagement_group_members")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .range(members.length, members.length + 199);
      if (error) throw new Error(error.message);
      setMembers((current) => [...current, ...(data ?? [])]);
      setMemberHasMore(members.length + (data?.length ?? 0) < memberCount);
      setMemberError(null);
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not load group members");
    } finally {
      setMemberLoading(false);
    }
  };

  const getAllMembers = async () => {
    const supabase = createClient();
    const all: EngagementGroupMember[] = [];
    for (let offset = 0; offset < memberCount; offset += 1000) {
      const { data, error } = await supabase
        .from("engagement_group_members")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .range(offset, Math.min(offset + 999, memberCount - 1));
      if (error) throw new Error(error.message);
      all.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return all;
  };

  const getRecentMemberValues = async () => {
    const supabase = createClient();
    const recent = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("scans")
        .select("input, finished_at")
        .eq("target_id", groupId)
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false })
        .range(offset, offset + 999);
      if (error) throw new Error(error.message);
      for (const scan of data ?? []) {
        if (scan.finished_at && Date.now() - new Date(scan.finished_at).getTime() <= 24 * 60 * 60 * 1000) recent.add(scan.input);
      }
      if (!data || data.length < 1000) break;
    }
    return recent;
  };

  const loadMoreScans = async () => {
    if (loadingMoreScans || statusCounts.total === null || scans.length >= statusCounts.total) return;
    setLoadingMoreScans(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("scans")
        .select("*")
        .eq("target_id", groupId)
        .order("created_at", { ascending: false })
        .range(scans.length, scans.length + 24);
      if (error) throw new Error(error.message);
      setScans((current) => [...current, ...(data ?? [])]);
    } catch (error) {
      setNotice({ kind: "err", text: error instanceof Error ? error.message : "Could not load more scans" });
    } finally {
      setLoadingMoreScans(false);
    }
  };

  const loadResults = useCallback(async (id: string) => {
    const supabase = createClient();
    const [sd, h, f] = await Promise.all([
      supabase.from("subdomains").select("*").eq("target_id", id).order("created_at", { ascending: false }).range(0, 199),
      supabase.from("hosts").select("*").eq("target_id", id).range(0, 199),
      supabase.from("findings").select("*").eq("target_id", id).order("created_at", { ascending: false }).range(0, 199),
    ]);
    setSubs(sd.data ?? []);
    setHosts(h.data ?? []);
    setFinds(f.data ?? []);
    setResultsHasMore([sd.data, h.data, f.data].some((rows) => (rows?.length ?? 0) === 200));
  }, []);

  const loadMoreResults = async () => {
    const supabase = createClient();
    const [sd, h, f] = await Promise.all([
      supabase.from("subdomains").select("*").eq("target_id", groupId).order("created_at", { ascending: false }).range(subs.length, subs.length + 199),
      supabase.from("hosts").select("*").eq("target_id", groupId).range(hosts.length, hosts.length + 199),
      supabase.from("findings").select("*").eq("target_id", groupId).order("created_at", { ascending: false }).range(finds.length, finds.length + 199),
    ]);
    if (sd.error || h.error || f.error) {
      setNotice({ kind: "err", text: sd.error?.message ?? h.error?.message ?? f.error?.message ?? "Could not load more results" });
      return;
    }
    setSubs((current) => [...current, ...(sd.data ?? [])]);
    setHosts((current) => [...current, ...(h.data ?? [])]);
    setFinds((current) => [...current, ...(f.data ?? [])]);
    setResultsHasMore([sd.data, h.data, f.data].some((rows) => (rows?.length ?? 0) === 200));
  };

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
    const scheduleRefresh = () => {
      if (liveRefreshTimer.current) return;
      liveRefreshTimer.current = setTimeout(() => {
        liveRefreshTimer.current = null;
        void loadFor(groupId);
      }, 1500);
    };
    const channel = supabase
      .channel(`console:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scans", filter: `target_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as Scan;
          const prev = scanStatus.current.get(row.id);
          scanStatus.current.set(row.id, row.status);
          if (prev !== row.status && (row.status === "done" || row.status === "running" || row.status === "failed")) {
            scheduleRefresh();
          }
          scheduleRefresh();
        },
      )
      .subscribe();
    const t = setTimeout(() => refreshPending(groupId), 0);
    return () => {
      clearTimeout(t);
      if (liveRefreshTimer.current) clearTimeout(liveRefreshTimer.current);
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

  async function addEnteredTargetToScopeAndRetry() {
    const target = parseTarget(parsed[0] ?? "");
    if (!target || groupId === "__new__") {
      setNotice({ kind: "err", text: "Create or select an engagement group before adding scope." });
      return;
    }
    setScopeActionBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("scope_entries").upsert(
        {
          target_id: groupId,
          kind: target.kind === "ip" ? "ip" : "domain",
          value: target.value,
          note: "added before active workflow run",
        },
        { onConflict: "target_id,kind,value", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
      setScopeEntries((entries) => [
        ...entries,
        { id: `pending-${target.value}`, target_id: groupId, kind: target.kind, value: target.value, note: "added before active workflow run", created_at: new Date().toISOString() },
      ]);
      await launch();
    } catch (e) {
      setNotice({ kind: "err", text: `Could not add target to authorized scope: ${e instanceof Error ? e.message : "unknown error"}` });
    } finally {
      setScopeActionBusy(false);
    }
  }

  async function importMembers() {
      const values = [...new Set(parsed.map((value) => parseTarget(value)).filter((value): value is NonNullable<typeof value> => !!value).map((value) => value.value))];
      if (!values.length) {
        setNotice({ kind: "err", text: "Enter valid public domains or IPs to import." });
        return;
      }
      setBusy(true);
      try {
        const target = await ensureGroup();
        if (!target) return;
        const supabase = createClient();
        const rows = values.map((value) => {
          const parsedTarget = parseTarget(value);
          return { group_id: target, value, kind: parsedTarget?.kind ?? "domain" };
        });
        const { error } = await supabase.from("engagement_group_members").upsert(rows, { onConflict: "group_id,value", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
        await loadFor(target);
        setInput("");
        setNotice({ kind: "ok", text: `Saved ${values.length} group member${values.length === 1 ? "" : "s"} — no scans queued` });
      } catch (error) {
        setNotice({ kind: "err", text: error instanceof Error ? error.message : "Could not import group members" });
      } finally {
        setBusy(false);
      }
    }

  async function scanMembers(values: string[]) {
    if (!values.length) return;
    for (let i = 0; i < values.length; i += 50) {
      await launch(values.slice(i, i + 50));
    }
  }

  async function launch(targetsOverride?: string[]) {
    const targetsToLaunch = targetsOverride ?? parsed;
    if (targetsToLaunch.length === 0) {
      setNotice({ kind: "err", text: "Enter at least one IP or domain" });
      return;
    }
    setNotice(null);
    setBusy(true);
    try {
      const target = await ensureGroup();
      if (!target) return;
      const batch = targetsToLaunch.slice(0, 50);
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
          mode: selectedMode,
          targets: batch,
          group_id: target,
          authorize: false,
          profile_id: selectedPipelineData?.profileId ?? null,
          pipeline: selectedPipelineData?.modules ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const resultErrors = (data.results ?? [])
          .filter((result: { status?: string; target?: string; error?: string }) => result.error)
          .slice(0, 5)
          .map((result: { target?: string; error?: string }) => `${result.target ?? "target"}: ${result.error}`);
        const message = resultErrors.length
          ? resultErrors.join(" · ")
          : data.detail
            ? `${data.error ?? "Scan request failed"}: ${data.detail}`
            : data.error || "Scan request failed";
        setNotice({ kind: "err", text: message });
      } else {
        const refused = (data.results ?? []).filter((r: { status: string }) => r.status !== "accepted");
        const parts = [`${data.accepted}/${data.total} scan(s) queued`];
        if (targetsToLaunch.length > 50) parts.push(`(first 50 of ${targetsToLaunch.length.toLocaleString()} — Import the rest)`);
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
      const memberRows = importable.flatMap((item) => {
        const entries = [item.name, item.ip].filter((value): value is string => !!value);
        return entries.flatMap((value) => {
          const parsedTarget = parseTarget(value);
          return parsedTarget ? [{ group_id: target, value: parsedTarget.value, kind: parsedTarget.kind }] : [];
        });
      });
      const { error: memberError } = await supabase.from("engagement_group_members").upsert(memberRows, {
        onConflict: "group_id,value",
        ignoreDuplicates: true,
      });
      if (memberError) throw new Error(memberError.message);
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
      let scanCancelled = false;
      if (scanAfter && newNames.length) {
        // Bulk scans now run through the SELECTED workflow (same pipeline/profile/
        // mode as a normal scan), not the old fast "enrich" path. The worker's DB
        // poller reads scans.pipeline / scans.mode per row, so a direct insert is
        // enough — no per-scan API round-trip, so thousands can queue at once.
        const mode = selectedMode;
        const workflowName = selectedPipelineData?.name ?? "selected workflow";
        if (mode === "full") {
          // Active workflow: confirm once, then authorize every imported name in
          // this group's scope so the worker's active-stage gate passes unattended.
          const ok = window.confirm(
            `Queue ${newNames.length} scan(s) through the "${workflowName}" workflow (ACTIVE).\n\n` +
              `This runs active modules (port scan, directory brute-force, vuln templates, web-server scan) against every imported host, and adds them to this group's authorized scope so the whole batch runs without asking again. Only continue for systems you are permitted to test.\n\n` +
              `Authorize and queue all ${newNames.length}?`,
          );
          if (ok) {
            await supabase.from("targets").update({ scope: "In Scope" }).eq("id", target);
            const scopeRows = newNames.map((n) => ({
              target_id: target, kind: "domain", value: n.toLowerCase(), note: "auto-authorized from bulk import",
            }));
            for (let i = 0; i < scopeRows.length; i += 500) {
              await supabase.from("scope_entries").upsert(scopeRows.slice(i, i + 500), {
                onConflict: "target_id,kind,value", ignoreDuplicates: true,
              });
            }
          } else {
            scanCancelled = true;
          }
        }
        if (!scanCancelled) {
          const profile_id = selectedPipelineData?.profileId ?? null;
          const pipeline = selectedPipelineData?.modules ?? null;
          const scanRows = newNames.map((n) => ({
            target_id: target, input: n, mode, status: "queued",
            requested_by_email: userEmail, profile_id, pipeline,
          }));
          for (let i = 0; i < scanRows.length; i += 500) {
            await supabase.from("scans").insert(scanRows.slice(i, i + 500));
            setNotice({ kind: "ok", text: `Queueing scans… ${Math.min(i + 500, scanRows.length)} / ${scanRows.length}` });
          }
          queued = scanRows.length;
          await refreshPending(target);
        }
      }

      await loadFor(target);
      const parts = [`Imported ${subRows.length} new`];
      if (skipped > 0) parts.push(`${skipped} already present (skipped)`);
      if (queued > 0) parts.push(`${queued} "${selectedPipelineData?.name ?? "scan"}" scans queued — running one at a time`);
      else if (scanCancelled) parts.push("scanning cancelled (rows imported only)");
      setNotice({ kind: "ok", text: parts.join(" · ") });
      setInput("");
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "Import failed" });
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

  const locked = pending !== null && pending > 0;
  const activeScan = scans.find((s) => s.status === "queued" || s.status === "running");
  const runningScan = scans.find((s) => s.status === "running") ?? null;
  const memberLastScan = useMemo(() => {
    const result = new Map<string, string>();
    for (const scan of scans) {
      if (!result.has(scan.input) && scan.finished_at) result.set(scan.input, scan.finished_at);
    }
    return result;
  }, [scans]);
  const [skipRecent, setSkipRecent] = useState(false);
  const memberSelectRef = useRef<HTMLInputElement>(null);
  const selectedMemberCount = selectAllMembers ? Math.max(memberCount - excludedMembers.size, 0) : selectedMembers.size;
  const allMembersSelected = memberCount > 0 && selectedMemberCount === memberCount;
  useEffect(() => {
    if (memberSelectRef.current) {
      memberSelectRef.current.indeterminate = selectedMemberCount > 0 && !allMembersSelected;
    }
  }, [selectedMemberCount, allMembersSelected]);
  const scanGroupMembers = async (all: boolean) => {
    setBusy(true);
    try {
      const allMembers = await getAllMembers();
      const recent = skipRecent ? await getRecentMemberValues() : new Set<string>();
      const values = allMembers
        .filter((member) => all || (selectAllMembers ? !excludedMembers.has(member.value) : selectedMembers.has(member.value)))
        .map((member) => member.value)
        .filter((value) => !recent.has(value));
      await scanMembers(values);
    } catch (error) {
      setNotice({ kind: "err", text: error instanceof Error ? error.message : "Could not prepare group scan" });
    } finally {
      setBusy(false);
    }
  };
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
      {statusError && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-xs text-rose-300">
          <span title={statusError}>Couldn’t load scan counters</span>
          <button type="button" disabled={statusLoading} onClick={() => void refreshPending(groupId)} className="underline underline-offset-2 disabled:opacity-50">Retry</button>
        </div>
      )}
      {locked && !statusError && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <svg className="h-4 w-4 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div className="flex-1 text-xs text-amber-200">
            <b>Queue running — {pending?.toLocaleString()} scan{pending === 1 ? "" : "s"} remaining.</b>{" "}
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
          <label className="flex min-w-0 items-center gap-2 text-[11px] text-muted">
            <span className="shrink-0">Workflow</span>
            <select
              value={selectedPipeline}
              onChange={(e) => chooseWorkflow(e.target.value)}
              className="max-w-[230px] rounded-md border border-white/10 bg-background px-2 py-1.5 text-[11px] outline-none focus:border-accent/40"
            >
              {pipelineRegistry && Object.entries(pipelineRegistry.profiles).map(([key, profile]) => (
                <option key={`builtin:${key}`} value={`builtin:${key}`}>
                  {profile.name} · {profile.modules.some((id) => pipelineRegistry.modules.find((m) => m.id === id)?.tier === "active") ? "High risk" : "Low risk"}
                </option>
              ))}
              {pipelineProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} · {profile.modules.some((module) => module.enabled && pipelineRegistry?.modules.find((m) => m.id === module.id)?.tier === "active") ? "High risk" : "Low risk"}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => void launch()}
            disabled={busy || locked || parsed.length === 0}
            className="btn btn-accent"
          >
            {busy ? "Working…" : `Run ${Math.min(parsed.length, 50) || ""} scan${Math.min(parsed.length, 50) === 1 ? "" : "s"}`}
          </button>
          {importable && (
            <>
              <button
                onClick={() => runImport(true)}
                disabled={busy || locked}
                className="btn btn-accent"
                title={`Load these hosts and queue a "${selectedPipelineData?.name ?? "selected"}" scan (${workflowRisk} risk) for each new one`}
              >
                ⚡ Import &amp; scan {importable.length.toLocaleString()} · {selectedPipelineData?.name ?? "workflow"}
              </button>
              <button onClick={() => runImport(false)} disabled={busy} className="btn" title="Just load the hosts, don't scan">
                ⬇ Import {importable.length.toLocaleString()} (no scan)
              </button>
            </>
          )}
          <button
            onClick={() => void importMembers()}
            disabled={busy || groupId === "__new__" || parsed.length === 0}
            className="btn"
            title="Save valid entries as group members without creating scans"
          >
            + Import to group (no scan)
          </button>
          {activeScan && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400 text-amber-400" />
              {activeScan.status === "queued" ? "Queued…" : `Running ${activeScan.input}: ${activeScan.stage ?? "starting"}`}
            </span>
          )}
        </div>

        {groupId !== "__new__" && (memberCount > 0 || memberError) && (
          <div className="mt-4 rounded-xl border border-white/5 bg-background/30 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  ref={memberSelectRef}
                  type="checkbox"
                  checked={allMembersSelected}
                  aria-label="Select all group members"
                  onChange={() => {
                    if (allMembersSelected || selectAllMembers) {
                      setSelectAllMembers(false);
                      setExcludedMembers(new Set());
                    } else {
                      setSelectAllMembers(true);
                      setSelectedMembers(new Set());
                    }
                  }}
                />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
                  Group members ({memberCount.toLocaleString()})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[10px] text-muted-dim">
                  <input type="checkbox" checked={skipRecent} onChange={(e) => setSkipRecent(e.target.checked)} />
                  Skip scanned in last 24h
                </label>
                <button
                  type="button"
                  disabled={busy || locked || memberCount === 0}
                  onClick={() => void scanGroupMembers(true)}
                  className="rounded-md border border-accent/30 bg-accent/15 px-2.5 py-1 text-[10px] font-semibold text-accent disabled:opacity-50"
                >
                  Scan all ({memberCount.toLocaleString()})
                </button>
                {selectedMemberCount > 0 && (
                  <button
                    type="button"
                    disabled={busy || locked}
                    onClick={() => void scanGroupMembers(false)}
                    className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-300 disabled:opacity-50"
                  >
                    Scan selected ({selectedMemberCount.toLocaleString()})
                  </button>
                )}
              </div>
            </div>
            {memberError && <p className="mb-2 text-[10px] text-rose-300">Could not load members: {memberError}</p>}
            <div className="grid max-h-56 gap-1 overflow-y-auto md:grid-cols-2">
              {members.map((member) => {
                const last = memberLastScan.get(member.value);
                const checked = selectAllMembers ? !excludedMembers.has(member.value) : selectedMembers.has(member.value);
                return (
                  <label key={member.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (selectAllMembers) {
                          setExcludedMembers((current) => {
                            const next = new Set(current);
                            if (next.has(member.value)) next.delete(member.value);
                            else next.add(member.value);
                            return next;
                          });
                        } else {
                          setSelectedMembers((current) => {
                            const next = new Set(current);
                            if (next.has(member.value)) next.delete(member.value);
                            else next.add(member.value);
                            return next;
                          });
                        }
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono">{member.value}</span>
                    <span className={last ? "text-[10px] text-muted-dim" : "text-[10px] text-amber-300"}>
                      {last ? `scanned ${new Date(last).toLocaleDateString()}` : "not scanned yet"}
                    </span>
                  </label>
                );
              })}
            </div>
            {memberHasMore && (
              <button
                type="button"
                onClick={() => void loadMoreMembers()}
                disabled={memberLoading}
                className="mt-2 w-full rounded-md border border-white/10 px-2 py-1.5 text-[10px] text-muted-dim hover:bg-white/5 disabled:opacity-50"
              >
                {memberLoading ? "Loading members…" : `Load more (${members.length.toLocaleString()} of ${memberCount.toLocaleString()})`}
              </button>
            )}
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-dim">
          <span>{selectedPipelineData?.name ?? "Workflow"}:</span>
          <span className={workflowRisk === "High" ? "text-rose-300" : "text-emerald-300"}>Risk: {workflowRisk}</span>
          <span>{pipelineModuleNames.length ? pipelineModuleNames.join(" → ") : "Loading pipeline modules…"}</span>
        </div>

        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] text-muted-dim hover:text-foreground">
            <span className="transition-transform group-open:rotate-90">▸</span> What do the scan modes mean?
          </summary>
          <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-[11px] text-muted">
            <p><span className="font-semibold text-indigo-300">Passive</span> — read-only recon: finds subdomains, resolves DNS, probes HTTP, fingerprints the tech stack, and matches known CVEs by version. Safe on anything.</p>
            <p><span className="font-semibold text-accent">Enrich</span> — a faster Passive for hosts you already have (used by bulk Import &amp; Scan). Skips subdomain discovery and just enriches each host: DNS + HTTP + tech + CVE. ~3s each instead of ~30s.</p>
            <p><span className="font-semibold text-rose-300">Full</span> — uses the selected pipeline and may include active modules such as nmap, TLS audit, directory brute-force, and nuclei. Active stages run only for targets in this group&apos;s authorized scope.</p>
          </div>
        </details>

        {parsed.length > 50 && (
          <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-300">
            That&apos;s <b>{parsed.length.toLocaleString()}</b> targets. Scanning runs one at a time on your VM, so it&apos;s
            capped at <b>50 per batch</b>. For a big list like this, click{" "}
            {importable ? <b>⬇ Import {importable.length.toLocaleString()} hosts</b> : <b>Import</b>} to load them instantly,
            then scan the ones you care about (select rows → or run a smaller batch).
          </div>
        )}
        {notice && (
          <div className={`mt-2 flex flex-col gap-2 rounded-lg border px-3 py-2 text-[11px] ${notice.kind === "ok" ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-300" : "border-rose-500/20 bg-rose-500/8 text-rose-300"}`}>
            {notice.text.split(" · ").map((line, i) => <span key={i}>{line}</span>)}
            {notice.kind === "err" && selectedMode === "full" && groupId !== "__new__" && (
              <button
                type="button"
                onClick={() => void addEnteredTargetToScopeAndRetry()}
                disabled={scopeActionBusy || busy}
                className="w-fit rounded-md border border-rose-300/30 bg-rose-500/15 px-2.5 py-1.5 text-[10px] font-semibold text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
              >
                {scopeActionBusy ? "Adding scope…" : "Add entered target to scope and retry"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className={`rounded-xl border p-4 ${runningScan ? "border-amber-500/30 bg-amber-500/[0.08]" : "border-white/5 bg-surface"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${runningScan ? "animate-pulse bg-amber-400" : "bg-muted-dim"}`} />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Now scanning</p>
            <p className={`mt-1 text-sm font-semibold ${runningScan ? "text-amber-200" : "text-muted"}`}>
              {scanListError ? "Couldn’t load scan status" : runningScan ? runningScan.input : "Idle — queue paused"}
            </p>
          </div>
          {scanListError ? (
            <button type="button" disabled={statusLoading} onClick={() => void loadFor(groupId)} className="ml-auto text-[11px] text-rose-300 underline underline-offset-2 disabled:opacity-50">Retry</button>
          ) : runningScan && (
            <span className="ml-auto rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300">
              {runningScan.stage ?? "starting"}
            </span>
          )}
        </div>
      </div>

      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] text-muted-dim hover:text-foreground">
          <span className="transition-transform group-open:rotate-90">▸</span>
          Authorized scope for active modules
        </summary>
        <div className="mt-2">
          <ScopeManager key={groupId} targetId={groupId} entries={scopeEntries} />
        </div>
      </details>

      {/* Live scans */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Scan activity {statusCounts.total !== null && <span className="text-muted-dim">({statusCounts.total})</span>}</h2>
            {failed !== null && failed > 0 && (
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
                {statusLoading ? "…" : statusError ? "—" : statusCounts[key as keyof typeof statusCounts]} {label}
              </span>
            ))}
          </div>
        </div>
        {scanListError ? (
          <div className="card flex items-center justify-between p-4 text-xs text-rose-300">
            <span title={scanListError}>Couldn’t load scan activity</span>
            <button type="button" onClick={() => void loadFor(groupId)} className="underline underline-offset-2">Retry</button>
          </div>
        ) : scans.length === 0 ? (
          <p className="card p-4 text-center text-xs text-muted-dim">No scans in this group yet.</p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {scans.slice(0, visibleScans).map((s) => <ScanRow key={s.id} scan={s} />)}
          </div>
        )}
        {statusCounts.total !== null && (visibleScans < scans.length || scans.length < statusCounts.total) ? (
          <button
            type="button"
            onClick={() => {
              if (visibleScans < scans.length) setVisibleScans((current) => current + 8);
              else void loadMoreScans();
            }}
            disabled={loadingMoreScans}
            className="mx-auto mt-3 block rounded-lg border border-white/10 px-4 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            {loadingMoreScans ? "Loading…" : `Load more scans (${Math.max(statusCounts.total - visibleScans, 0).toLocaleString()} remaining)`}
          </button>
        ) : null}
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
          onLoadMore={resultsHasMore ? () => void loadMoreResults() : undefined}
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
