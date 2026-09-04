import type { Likelihood } from "@/lib/types";

const config: Record<Likelihood, { bg: string; text: string; dot: string; border: string }> = {
  Info: { bg: "bg-zinc-500/8", text: "text-zinc-400", dot: "bg-zinc-400", border: "border-zinc-500/20" },
  Low: { bg: "bg-emerald-500/8", text: "text-emerald-400", dot: "bg-emerald-400", border: "border-emerald-500/20" },
  Medium: { bg: "bg-amber-500/8", text: "text-amber-400", dot: "bg-amber-400", border: "border-amber-500/20" },
  High: { bg: "bg-rose-500/8", text: "text-rose-400", dot: "bg-rose-400", border: "border-rose-500/20" },
  Critical: { bg: "bg-red-600/12", text: "text-red-300", dot: "bg-red-300", border: "border-red-500/25" },
};

export function LikelihoodBadge({ value }: { value: Likelihood }) {
  const c = config[value];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${c.bg} ${c.text} ${c.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {value}
    </span>
  );
}
