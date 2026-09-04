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
      className="group flex flex-col gap-3.5 rounded-xl border border-white/5 bg-surface p-4 transition-all duration-300 hover:border-accent/15 hover:bg-surface-hover hover:shadow-[0_0_30px_rgba(0,229,160,0.04)]"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.03] text-base transition-all duration-300 group-hover:bg-accent/10 group-hover:shadow-[0_0_12px_rgba(0,229,160,0.1)]">
            {CATEGORY_ICONS[target.category] ?? "📁"}
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">{target.name}</h3>
            {target.domain && (
              <span className="text-[11px] text-muted-dim">{target.domain}</span>
            )}
          </div>
        </div>
        {target.scope === "Out of Scope" && (
          <span className="rounded-md border border-red-500/20 bg-red-500/8 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
            Out of scope
          </span>
        )}
      </div>

      {/* IP range */}
      {target.ip_range && (
        <div className="font-mono text-[11px] text-muted-dim">
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
        <span className="text-white/10">|</span>
        <span>
          {findings.length} finding{findings.length !== 1 ? "s" : ""}
        </span>
        {critCount > 0 && (
          <>
            <span className="text-white/10">|</span>
            <span className="text-rose-400">
              {critCount} critical
            </span>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/4 pt-3">
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
            STATUS_COLORS[target.status] ?? "bg-white/5 text-muted border-white/10"
          }`}
        >
          {target.status}
        </span>
        {topRisk && <LikelihoodBadge value={topRisk} />}
      </div>
    </Link>
  );
}
