import type { HostStatus } from "@/lib/types";

const colors: Record<HostStatus, string> = {
  Live: "bg-emerald-400",
  Down: "bg-red-400",
  Filtered: "bg-amber-400",
};

export function StatusDot({ status }: { status: HostStatus }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />
  );
}
