import type { HostStatus } from "@/lib/types";

const colors: Record<HostStatus, { dot: string; ring: string }> = {
  Live: { dot: "bg-emerald-400", ring: "ring-emerald-400/30" },
  Down: { dot: "bg-rose-400", ring: "ring-rose-400/30" },
  Filtered: { dot: "bg-amber-400", ring: "ring-amber-400/30" },
};

export function StatusDot({ status }: { status: HostStatus }) {
  const c = colors[status];
  return (
    <span className="relative inline-flex h-2.5 w-2.5 flex-shrink-0">
      {status === "Live" && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${c.dot}`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ${c.dot} ${c.ring}`} />
    </span>
  );
}
