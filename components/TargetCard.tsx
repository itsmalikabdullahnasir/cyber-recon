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
  const critCount = findings.filter((f) => f.severity === "Critical" || f.severity === "High").length;
  const liveHosts = hosts.filter((h) => h.status === "Live").length;

  return (
    <Link
      href={`/targets/${target.id}`}
      className="group relative overflow-hidden rounded-xl border border-white/5 bg-surface p-4 transition-all duration-300 hover:border-accent/20 hover:bg-surface-hover hover:shadow-[0_0_30px_rgba(168,85,247,0.06)]"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] to-fuchsia/[0.02] opacity-0 transition-opacity group-hover:opacity-100" />
      
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.03] text-base transition-all duration-300 group-hover:bg-accent/10 group-hover:shadow-[0_0_16px_rgba(168,85,247,0.15)]">
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
            <span className="rounded-md border border-rose-500/20 bg-rose-500/8 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
              Out of scope
            </span>
          )}
        </div>

        {target.ip_range && (
          <div className="mt-2 font-mono text-[11px] text-muted-dim">{target.ip_range}</div>
        )}

        <div className="mt-3">
          <RiskBar hosts={hosts} />
        </div>

        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {liveHosts}/{hosts.length} live
          </span>
          <span className="text-muted-dim">|</span>
          <span>{findings.length} finding{findings.length !== 1 ? "s" : ""}</span>
          {critCount > 0 && (
            <>
              <span className="text-muted-dim">|</span>
              <span className="text-pink-400">{critCount} critical</span>
            </>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/4 pt-3">
          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[target.status] ?? "bg-white/5 text-muted border-white/10"}`}>
            {target.status}
          </span>
          {topRisk && <LikelihoodBadge value={topRisk} />}
        </div>
      </div>
    </Link>
  );
}
