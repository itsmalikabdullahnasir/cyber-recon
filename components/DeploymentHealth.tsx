"use client";

type Check = { name: string; ready: boolean };
type Health = {
  schema_version?: string;
  checked_at?: string;
  ready?: boolean;
  checks?: Check[];
  migration_checklist?: string[];
};
type Quality = {
  score?: number;
  total?: number;
  complete?: number;
  incomplete?: number;
  missing_fingerprint?: number;
  duplicates?: number;
  stale?: number;
};

export function DeploymentHealth({ health, quality }: { health: Health | null; quality: Quality | null }) {
  const ready = health?.ready === true;
  const score = quality?.score ?? 0;
  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <div className={`rounded-xl border p-4 ${ready ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-amber-500/25 bg-amber-500/[0.04]"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Database health</p>
            <h3 className="mt-1 text-sm font-semibold">{ready ? "Schema ready" : "Migration attention required"}</h3>
          </div>
          <span className={`rounded px-2 py-1 text-[10px] ${ready ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
            {health ? `v${health.schema_version ?? "unknown"}` : "RPC unavailable"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {(health?.checks ?? []).map((check) => (
            <div key={check.name} className="rounded border border-white/5 bg-background/20 p-2">
              <span className={check.ready ? "text-emerald-300" : "text-rose-300"}>{check.ready ? "✓" : "!"}</span>
              <p className="mt-1 truncate text-[10px] text-muted-dim" title={check.name}>{check.name}</p>
            </div>
          ))}
        </div>
        {!health && <p className="mt-3 text-xs text-amber-300">Apply migration 20261108001600 to enable deployment checks.</p>}
      </div>
      <div className={`rounded-xl border p-4 ${score >= 90 ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-amber-500/25 bg-amber-500/[0.04]"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Finding data quality</p>
            <h3 className="mt-1 text-sm font-semibold">{score}% complete context</h3>
          </div>
          <span className="text-2xl font-bold">{score}%</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          <Metric label="Total" value={quality?.total} />
          <Metric label="Incomplete" value={quality?.incomplete} />
          <Metric label="Duplicates" value={quality?.duplicates} />
          <Metric label="Stale" value={quality?.stale} />
          <Metric label="No fingerprint" value={quality?.missing_fingerprint} />
        </div>
        {!quality && <p className="mt-3 text-xs text-amber-300">Data-quality RPC unavailable until the health migration is applied.</p>}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value?: number }) {
  return <div><p className="text-[10px] uppercase tracking-widest text-muted-dim">{label}</p><p className="mt-1 font-semibold">{(value ?? 0).toLocaleString()}</p></div>;
}
