export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/6 bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight ${
          accent ? "text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
