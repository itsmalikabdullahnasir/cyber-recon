import type { Host, Likelihood } from "@/lib/types";
import { LIKELIHOOD_ORDER } from "@/lib/types";

const barColors: Record<Likelihood, string> = {
  Info: "bg-slate-500",
  Low: "bg-teal-500",
  Medium: "bg-amber-500",
  High: "bg-red-500",
  Critical: "bg-red-700",
};

const barHoverColors: Record<Likelihood, string> = {
  Info: "hover:bg-slate-400",
  Low: "hover:bg-teal-400",
  Medium: "hover:bg-amber-400",
  High: "hover:bg-red-400",
  Critical: "hover:bg-red-600",
};

export function RiskBar({ hosts, compact }: { hosts: Host[]; compact?: boolean }) {
  if (hosts.length === 0) {
    return (
      <div
        className={`w-full rounded-full bg-white/5 ${compact ? "h-1" : "h-1.5"}`}
      />
    );
  }

  const counts: Record<Likelihood, number> = {
    Info: 0,
    Low: 0,
    Medium: 0,
    High: 0,
    Critical: 0,
  };

  for (const h of hosts) {
    counts[h.exploitability]++;
  }

  const total = hosts.length;
  const ordered: Likelihood[] = ["Critical", "High", "Medium", "Low", "Info"];

  return (
    <div
      className={`group flex w-full overflow-hidden rounded-full ${
        compact ? "h-1" : "h-1.5"
      }`}
      title={ordered
        .filter((l) => counts[l] > 0)
        .map((l) => `${l}: ${counts[l]}`)
        .join(" · ")}
    >
      {ordered.map((level) => {
        const count = counts[level];
        if (count === 0) return null;
        const pct = (count / total) * 100;
        return (
          <div
            key={level}
            className={`h-full transition-all ${barColors[level]} ${barHoverColors[level]}`}
            style={{ width: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}

export function highestLikelihood(hosts: Host[]): Likelihood | null {
  if (hosts.length === 0) return null;
  return hosts.reduce(
    (max, h) =>
      LIKELIHOOD_ORDER[h.exploitability] > LIKELIHOOD_ORDER[max]
        ? h.exploitability
        : max,
    hosts[0].exploitability
  );
}
