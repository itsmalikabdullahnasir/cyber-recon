export function StatCard({
  icon,
  label,
  value,
  accent,
  sub,
}: {
  icon: string;
  label: string;
  value: number;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div className="group rounded-xl border border-white/5 bg-surface p-4 transition-all duration-200 hover:border-white/8 hover:bg-surface-hover">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-dim">
          {label}
        </span>
        <span className="text-sm opacity-50 transition-opacity group-hover:opacity-80">
          {icon}
        </span>
      </div>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight ${
          accent ? "text-rose-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[10px] text-muted-dim">{sub}</p>}
    </div>
  );
}
