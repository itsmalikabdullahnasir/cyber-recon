import type { Scope } from "@/lib/types";

export function ScopeBanner({ scope }: { scope: Scope }) {
  if (scope === "In Scope") return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-2.5 text-xs font-medium text-red-300">
      <span className="text-sm">⚠</span>
      Out of scope — do not test or interact with this target
    </div>
  );
}
