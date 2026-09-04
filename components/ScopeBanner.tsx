import type { Scope } from "@/lib/types";

export function ScopeBanner({ scope }: { scope: Scope }) {
  if (scope === "In Scope") return null;

  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">
      Out of scope — do not test or interact with this target
    </div>
  );
}
