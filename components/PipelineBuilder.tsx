"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModuleDef, ModuleRegistry, PipelineModule, PipelineProfile } from "@/lib/types";

// Three-pane Pipeline Builder.
//   LEFT   — available modules from the worker registry (/api/modules), grouped by
//            category, searchable, each badged with its real install state.
//   CENTER — the pipeline you're assembling: drag to reorder, toggle, remove, with
//            a live summary (stages, worst-case time, missing deps, uninstalled).
//   RIGHT  — details of the selected module.
// Custom pipelines persist via /api/pipelines. Built-in presets are editable
// starting points; saving creates a reusable custom profile.
export function PipelineBuilder() {
  const [registry, setRegistry] = useState<ModuleRegistry | null>(null);
  const [saved, setSaved] = useState<PipelineProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pipeline, setPipeline] = useState<PipelineModule[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [mRes, pRes] = await Promise.all([fetch("/api/modules"), fetch("/api/pipelines")]);
      if (!mRes.ok) {
        const d = await mRes.json().catch(() => ({}));
        throw new Error(d.detail ? `${d.error}: ${d.detail}` : d.error || `modules ${mRes.status}`);
      }
      setRegistry(await mRes.json());
      if (!pRes.ok) {
        const d = await pRes.json().catch(() => ({}));
        throw new Error(d.error || `pipelines ${pRes.status}`);
      }
      setSaved((await pRes.json()).profiles ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "failed to load the registry");
    } finally {
      setLoading(false);
    }
  }

  const byId = useMemo(() => {
    const m: Record<string, ModuleDef> = {};
    for (const mod of registry?.modules ?? []) m[mod.id] = mod;
    return m;
  }, [registry]);

  const inPipeline = useMemo(() => new Set(pipeline.map((p) => p.id)), [pipeline]);

  // Available modules grouped by category, honoring the search box.
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: Record<string, ModuleDef[]> = {};
    for (const m of registry?.modules ?? []) {
      if (q && !`${m.name} ${m.id} ${m.description} ${m.category}`.toLowerCase().includes(q)) continue;
      (out[m.category] ??= []).push(m);
    }
    return out;
  }, [registry, search]);

  // -- pipeline edits --------------------------------------------------------
  const addModule = useCallback(
    (id: string) => {
      if (inPipeline.has(id)) return;
      setPipeline((p) => [...p, { id, enabled: true }]);
      setSelected(id);
    },
    [inPipeline],
  );
  const removeModule = (id: string) => setPipeline((p) => p.filter((x) => x.id !== id));
  const toggle = (id: string) => setPipeline((p) => p.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)));
  const reorder = (from: number, to: number) =>
    setPipeline((p) => {
      if (to < 0 || to >= p.length || from === to) return p;
      const c = [...p];
      const [moved] = c.splice(from, 1);
      c.splice(to, 0, moved);
      return c;
    });
  const move = (i: number, dir: -1 | 1) => reorder(i, i + dir);

  function loadBuiltin(key: string) {
    const prof = registry?.profiles?.[key];
    if (!prof) return;
    setPipeline(prof.modules.map((id) => ({ id, enabled: true })));
    setName(prof.name);
    setEditingId(null);
    setSelected(prof.modules[0] ?? null);
    setNotice(null);
  }
  function loadSaved(prof: PipelineProfile) {
    setPipeline(prof.modules ?? []);
    setName(prof.name);
    setEditingId(prof.id);
    setSelected(prof.modules?.[0]?.id ?? null);
    setNotice(null);
  }
  function reset() {
    setPipeline([]);
    setName("");
    setEditingId(null);
    setSelected(null);
    setNotice(null);
  }

  // Dependencies of the module at idx not enabled earlier in the pipeline.
  const missingDeps = useCallback(
    (idx: number): string[] => {
      const mod = byId[pipeline[idx].id];
      if (!mod) return [];
      const earlier = new Set(pipeline.slice(0, idx).filter((x) => x.enabled).map((x) => x.id));
      return mod.dependencies.filter((d) => !earlier.has(d));
    },
    [byId, pipeline],
  );

  // Add every missing dependency and re-order the whole pipeline into the
  // registry's natural (dependency-respecting) order. Keeps existing on/off.
  function autoFix() {
    if (!registry) return;
    const need = new Set<string>();
    const visit = (id: string) => {
      const m = byId[id];
      if (!m || need.has(id)) return;
      need.add(id);
      m.dependencies.forEach(visit);
    };
    pipeline.filter((p) => p.enabled).forEach((p) => visit(p.id));
    const existing = new Map(pipeline.map((p) => [p.id, p]));
    const ordered = registry.modules.map((m) => m.id).filter((id) => need.has(id));
    setPipeline(ordered.map((id) => existing.get(id) ?? { id, enabled: true }));
    setNotice({ kind: "ok", text: "Added missing dependencies and ordered the pipeline." });
  }

  // -- persistence -----------------------------------------------------------
  async function refreshSaved() {
    const r = await fetch("/api/pipelines");
    if (r.ok) setSaved((await r.json()).profiles ?? []);
  }
  async function save(asNew = false) {
    if (!name.trim()) return setNotice({ kind: "err", text: "Give the pipeline a name first." });
    if (pipeline.length === 0) return setNotice({ kind: "err", text: "Add at least one module." });
    setBusy(true);
    setNotice(null);
    try {
      const body = JSON.stringify({ name: name.trim(), modules: pipeline });
      const res =
        editingId && !asNew
          ? await fetch(`/api/pipelines/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
          : await fetch("/api/pipelines", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "save failed");
      if (data.profile?.id) setEditingId(data.profile.id);
      await refreshSaved();
      setNotice({ kind: "ok", text: editingId && !asNew ? "Pipeline updated." : "Pipeline saved." });
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "save failed" });
    } finally {
      setBusy(false);
    }
  }
  async function del(id: string) {
    if (!confirm("Delete this saved pipeline?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pipelines/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "delete failed");
      if (editingId === id) reset();
      await refreshSaved();
      setNotice({ kind: "ok", text: "Deleted." });
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "delete failed" });
    } finally {
      setBusy(false);
    }
  }

  // -- derived summary -------------------------------------------------------
  const stats = useMemo(() => {
    const enabled = pipeline.filter((p) => p.enabled);
    let active = 0;
    let notInstalled = 0;
    let seconds = 0;
    for (const p of enabled) {
      const m = byId[p.id];
      if (!m) continue;
      if (m.tier === "active") active++;
      if (!m.installed) notInstalled++;
      if (typeof m.timeout === "number") seconds += m.timeout;
    }
    const depGaps = pipeline.reduce((n, _p, i) => n + (missingDeps(i).length > 0 ? 1 : 0), 0);
    return { total: enabled.length, active, notInstalled, seconds, depGaps };
  }, [pipeline, byId, missingDeps]);

  // -- render ----------------------------------------------------------------
  if (loading) return <p className="card p-6 text-center text-sm text-muted-dim">Loading modules…</p>;
  if (loadError)
    return (
      <div className="card p-6 text-sm">
        <p className="text-rose-300">Couldn&apos;t load the module registry: {loadError}</p>
        <p className="mt-2 text-xs text-muted-dim">
          Usually means the worker is unreachable or Vercel&apos;s <code>RECON_WORKER_URL</code> /{" "}
          <code>RECON_WORKER_SECRET</code> aren&apos;t set.
        </p>
        <button onClick={load} className="btn mt-3">
          Retry
        </button>
      </div>
    );

  const selectedMod = selected ? byId[selected] : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar: load / name / save */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Profile</span>
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("builtin:")) loadBuiltin(v.slice(8));
            else if (v.startsWith("saved:")) {
              const prof = saved.find((s) => s.id === v.slice(6));
              if (prof) loadSaved(prof);
            }
          }}
          className="rounded-lg border border-white/10 bg-background px-3 py-1.5 text-xs outline-none focus:border-accent/40"
        >
          <option value="">Load preset or saved profile…</option>
          {registry?.profiles &&
            Object.entries(registry.profiles).map(([key, p]) => (
              <option key={key} value={`builtin:${key}`}>
                ★ {p.name}
              </option>
            ))}
          {saved.map((p) => (
            <option key={p.id} value={`saved:${p.id}`}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this pipeline"
          className="min-w-[180px] flex-1 rounded-lg border border-white/10 bg-background px-3 py-1.5 text-sm outline-none focus:border-accent/40"
        />
        <button onClick={() => save(false)} disabled={busy} className="btn btn-accent">
          {busy ? "Saving…" : editingId ? "Update" : "Save"}
        </button>
        {editingId && (
          <button onClick={() => save(true)} disabled={busy} className="btn">
            Save as new
          </button>
        )}
        <button onClick={reset} disabled={busy} className="btn">
          New
        </button>
      </div>

      {/* Saved profile chips */}
      {saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-muted-dim">Saved</span>
          {saved.map((p) => (
            <span
              key={p.id}
              className={`group flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                editingId === p.id ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted hover:border-white/20"
              }`}
            >
              <button onClick={() => loadSaved(p)}>{p.name}</button>
              <button onClick={() => del(p.id)} className="text-muted-dim hover:text-rose-300" title="Delete">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {notice && (
        <div
          className={`rounded-lg border px-3 py-2 text-[11px] ${
            notice.kind === "ok"
              ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-300"
              : "border-rose-500/20 bg-rose-500/8 text-rose-300"
          }`}
        >
          {notice.text}
        </div>
      )}

      <p className="text-[11px] text-muted-dim">
        Load Passive or Full Active above, modify the stages, then click Save to create an editable custom profile.
        TLS Audit is optional and is not included in the default scans.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(0,0.9fr)]">
        {/* LEFT — available modules, grouped */}
        <div className="card flex flex-col gap-2 p-3">
          <h2 className="text-sm font-semibold">Available modules</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules…"
            className="w-full rounded-lg border border-white/10 bg-background px-3 py-1.5 text-xs outline-none focus:border-accent/40"
          />
          <div className="mt-1 flex max-h-[600px] flex-col gap-3 overflow-y-auto pr-1">
            {Object.keys(grouped).length === 0 && <p className="py-4 text-center text-xs text-muted-dim">No modules match.</p>}
            {(registry?.categories ?? []).map((category) => {
              const mods = grouped[category];
              if (!mods || mods.length === 0) return null;
              return (
                <div key={category}>
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-dim">{category}</p>
                  <div className="flex flex-col gap-1.5">
                    {mods.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => setSelected(m.id)}
                        className={`cursor-pointer rounded-lg border p-2 transition-colors ${
                          selected === m.id ? "border-accent/40 bg-accent/5" : "border-white/5 bg-white/[0.02] hover:border-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <TierDot tier={m.tier} />
                          <span className="text-xs font-medium">{m.name}</span>
                          <InstallBadge m={m} />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addModule(m.id);
                            }}
                            disabled={inPipeline.has(m.id)}
                            className="ml-auto rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
                          >
                            {inPipeline.has(m.id) ? "Added" : "+ Add"}
                          </button>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-dim">{m.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER — the pipeline */}
        <div className="card flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Pipeline</h2>
            {stats.depGaps > 0 && (
              <button
                onClick={autoFix}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
                title="Add missing dependencies and order the pipeline"
              >
                ⚡ Auto-fix dependencies
              </button>
            )}
          </div>

          {/* summary */}
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <Stat label="stages" value={String(stats.total)} tone="accent" />
            <Stat label="active" value={String(stats.active)} tone="rose" />
            <Stat label="worst-case" value={stats.seconds ? `~${Math.ceil(stats.seconds / 60)}m` : "—"} tone="zinc" />
            {stats.depGaps > 0 && <Stat label="dep gaps" value={String(stats.depGaps)} tone="amber" />}
            {stats.notInstalled > 0 && <Stat label="not installed" value={String(stats.notInstalled)} tone="rose" />}
          </div>

          {pipeline.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 py-10 text-center text-xs text-muted-dim">
              Load a profile above, or add modules from the left to start building.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {pipeline.map((pm, i) => {
                const m = byId[pm.id];
                const deps = missingDeps(i);
                return (
                  <div
                    key={pm.id}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIdx !== null) reorder(dragIdx, i);
                      setDragIdx(null);
                    }}
                    onClick={() => setSelected(pm.id)}
                    className={`cursor-pointer rounded-lg border p-2 transition-colors ${
                      selected === pm.id ? "border-accent/40 bg-accent/5" : "border-white/5 bg-white/[0.02]"
                    } ${dragIdx === i ? "opacity-40" : ""} ${pm.enabled ? "" : "opacity-50"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="cursor-grab select-none text-muted-dim" title="Drag to reorder">
                        ⠿
                      </span>
                      <span className="text-[10px] text-muted-dim">{i + 1}</span>
                      {m && <TierDot tier={m.tier} />}
                      <span className="text-xs font-medium">{m?.name ?? pm.id}</span>
                      {m && <InstallBadge m={m} />}
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            move(i, -1);
                          }}
                          disabled={i === 0}
                          className="rounded border border-white/10 px-1.5 text-[11px] text-muted-dim hover:text-foreground disabled:opacity-30"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            move(i, 1);
                          }}
                          disabled={i === pipeline.length - 1}
                          className="rounded border border-white/10 px-1.5 text-[11px] text-muted-dim hover:text-foreground disabled:opacity-30"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(pm.id);
                          }}
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                            pm.enabled
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-white/10 text-muted-dim"
                          }`}
                          title={pm.enabled ? "Disable" : "Enable"}
                        >
                          {pm.enabled ? "On" : "Off"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeModule(pm.id);
                          }}
                          className="rounded border border-rose-500/30 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/10"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {deps.length > 0 && (
                      <p className="mt-1 pl-6 text-[10px] text-amber-400/90">
                        needs {deps.map((d) => byId[d]?.name ?? d).join(", ")} enabled before it
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {stats.active > 0 && (
            <p className="mt-1 rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1.5 text-[10px] text-rose-300/90">
              This pipeline includes active modules — they only run against targets in your authorized scope.
            </p>
          )}
          <p className="mt-1 text-[10px] text-muted-dim">
            Drag the ⠿ handle (or use ↑/↓) to reorder. Running a saved pipeline is wired in the next step — for now, build
            and save.
          </p>
        </div>

        {/* RIGHT — selected module details */}
        <div className="card flex flex-col gap-2 p-3">
          <h2 className="text-sm font-semibold">Module details</h2>
          {!selectedMod ? (
            <p className="py-10 text-center text-xs text-muted-dim">Select a module to see its configuration.</p>
          ) : (
            <div className="flex flex-col gap-2 text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <TierDot tier={selectedMod.tier} />
                  <span className="font-semibold">{selectedMod.name}</span>
                  <InstallBadge m={selectedMod} />
                </div>
                <p className="mt-0.5 text-[11px] text-muted-dim">{selectedMod.description}</p>
              </div>
              <Detail label="Category" value={selectedMod.category} />
              <Detail label="Tier" value={selectedMod.tier === "active" ? "Active (scope-gated)" : "Passive"} />
              <Detail label="Tools" value={selectedMod.tools.length ? selectedMod.tools.join(", ") : "none (built-in)"} />
              <Detail label="Timeout" value={selectedMod.timeout != null ? `${selectedMod.timeout}s` : "—"} />
              <Detail
                label="Depends on"
                value={
                  selectedMod.dependencies.length
                    ? selectedMod.dependencies.map((d) => byId[d]?.name ?? d).join(", ")
                    : "nothing"
                }
              />
              <Detail label="Produces" value={selectedMod.outputs.length ? selectedMod.outputs.join(", ") : "—"} />
              {!selectedMod.installed && (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-2 py-1.5 text-[10px] text-amber-300">
                  Not installed on the VM — it will be skipped in a run until you install it.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TierDot({ tier }: { tier: "passive" | "active" }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${tier === "active" ? "bg-rose-400" : "bg-indigo-400"}`}
      title={tier === "active" ? "Active (scope-gated)" : "Passive"}
    />
  );
}

function InstallBadge({ m }: { m: ModuleDef }) {
  if (!m.installed)
    return (
      <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-medium text-rose-300">
        Not installed
      </span>
    );
  if (!m.enabled_on_vm)
    return (
      <span className="rounded border border-zinc-500/30 bg-zinc-500/10 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
        Disabled on VM
      </span>
    );
  return (
    <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
      Ready
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "accent" | "rose" | "amber" | "zinc" }) {
  const cls = {
    accent: "border-accent/30 bg-accent/10 text-accent",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    zinc: "border-white/10 text-muted-dim",
  }[tone];
  return (
    <span className={`rounded-md border px-2 py-0.5 font-medium ${cls}`}>
      {value} {label}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide text-muted-dim">{label}</span>
      <span className="text-[11px]">{value}</span>
    </div>
  );
}
