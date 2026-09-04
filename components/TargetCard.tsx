import Link from "next/link";
import type { Target, Host, Finding } from "@/lib/types";
import { LIKELIHOOD_ORDER, STATUS_COLORS, CATEGORY_ICONS } from "@/lib/types";
import { RiskBar, highestLikelihood } from "@/components/RiskBar";
import { LikelihoodBadge } from "@/components/LikelihoodBadge";

export function TargetCard({
  target,
  hosts,
  findings,
}: {
  target: Target;
  hosts: Host[];
  findings: Finding[];
}) {
  const topRisk = highestLikelihood(hosts);
  const critCount = findings.filter(
    (f) => f.severity === "Critical" || f.severity === "High"
  ).length;
  const liveHosts = hosts.filter((h) => h.status === "Live").length;

  return (
    <Link
      href={`/targets/${target.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-white/6 bg-surface p-4 transition-all hover:border-white/12 hover:bg-surface-hover hover:shadow-lg hover:shadow-black/20"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-base transition-colors group-hover:bg-accent/10">
            {CATEGORY_ICONS[target.category] ?? "📁"}
          </div>
          <div>
            <h3 className="text-sm font-semibold">{target.name}</h3>
            <div className="flex items-center gap-1.5">
              {target.domain && (
                <span className="text-[11px] text-muted">{target.domain}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {target.scope === "Out of Scope" && (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
              Out of scope
            </span>
          )}
        </div>
      </div>

      {/* IP range */}
      {target.ip_range && (
        <div className="font-mono text-xs text-muted-dim">
          {target.ip_range}
        </div>
      )}

      {/* Risk bar */}
      <RiskBar hosts={hosts} />

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {liveHosts}/{hosts.length} live
        </span>
        <span>·</span>
        <span>
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </span>
        {critCount > 0 && (
          <>
            <span>·</span>
            <span className="text-red-400">
              {critCount} critical
            </span>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/4 pt-2.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            STATUS_COLORS[target.status] ?? "bg-white/5 text-muted"
          }`}
        >
          {target.status}
        </span>
        {topRisk && <LikelihoodBadge value={topRisk} />}
      </div>
    </Link>
  );
}
