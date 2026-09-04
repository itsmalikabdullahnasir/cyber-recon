import type { Likelihood } from "@/lib/types";

const config: Record<Likelihood, { bg: string; text: string; dot: string }> = {
  Info: { bg: "bg-slate-500/10", text: "text-slate-400", dot: "bg-slate-400" },
  Low: { bg: "bg-teal-500/10", text: "text-teal-400", dot: "bg-teal-400" },
  Medium: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400" },
  High: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
  Critical: { bg: "bg-red-700/15", text: "text-red-300", dot: "bg-red-300" },
};

export function LikelihoodBadge({ value }: { value: Likelihood }) {
  const c = config[value];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${c.bg} ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {value}
    </span>
  );
}
