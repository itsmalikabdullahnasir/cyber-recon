import type { Severity } from "@/lib/types";

const config: Record<Severity, { bg: string; text: string; dot: string; border: string }> = {
  Info: { bg: "bg-zinc-500/8", text: "text-zinc-400", dot: "bg-zinc-400", border: "border-zinc-500/20" },
  Low: { bg: "bg-indigo-500/8", text: "text-indigo-400", dot: "bg-indigo-400", border: "border-indigo-500/20" },
  Medium: { bg: "bg-amber-500/8", text: "text-amber-400", dot: "bg-amber-400", border: "border-amber-500/20" },
  High: { bg: "bg-pink-500/8", text: "text-pink-400", dot: "bg-pink-400", border: "border-pink-500/20" },
  Critical: { bg: "bg-rose-600/12", text: "text-rose-300", dot: "bg-rose-300", border: "border-rose-500/25" },
};

export function SeverityBadge({ value }: { value: Severity }) {
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
