import type { Severity } from "@/lib/types";

const config: Record<Severity, { bg: string; text: string }> = {
  Info: { bg: "bg-slate-500/15", text: "text-slate-400" },
  Low: { bg: "bg-teal-500/15", text: "text-teal-400" },
  Medium: { bg: "bg-amber-500/15", text: "text-amber-400" },
  High: { bg: "bg-red-500/15", text: "text-red-400" },
  Critical: { bg: "bg-red-700/20", text: "text-red-300" },
};

export function SeverityBadge({ value }: { value: Severity }) {
  const c = config[value];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
      {value}
    </span>
  );
}
