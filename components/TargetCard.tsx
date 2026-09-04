import Link from "next/link";
import type { Target, Host } from "@/lib/types";
import { LIKELIHOOD_ORDER } from "@/lib/types";
import { RiskBar, highestLikelihood } from "@/components/RiskBar";
import { LikelihoodBadge } from "@/components/LikelihoodBadge";

export function TargetCard({
  target,
  hosts,
}: {
  target: Target;
  hosts: Host[];
}) {
  const topRisk = highestLikelihood(hosts);

  return (
    <Link
      href={`/targets/${target.id}`}
      className="flex flex-col gap-3 rounded-xl border border-white/6 bg-surface p-4 transition-colors hover:bg-surface-hover"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-sm">
            {target.category === "University" ? "U" : "C"}
          </div>
          <div>
            <h3 className="text-sm font-medium">{target.name}</h3>
            {target.ip_range && (
              <p className="font-mono text-xs text-muted">{target.ip_range}</p>
            )}
          </div>
        </div>
        {target.scope === "Out of Scope" && (
          <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-400">
            Out of scope
          </span>
        )}
      </div>

      <RiskBar hosts={hosts} />

      <div className="flex items-center justify-between text-xs text-muted">
        <span>{hosts.length} host{hosts.length !== 1 ? "s" : ""}</span>
        {topRisk && <LikelihoodBadge value={topRisk} />}
      </div>
    </Link>
  );
}
