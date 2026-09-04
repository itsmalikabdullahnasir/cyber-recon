export function StatCard({
  icon,
  label,
  value,
  accent,
  sub,
  sparkData,
  sparkColor,
}: {
  icon: string;
  label: string;
  value: number;
  accent?: boolean;
  sub?: string;
  sparkData?: number[];
  sparkColor?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/5 bg-surface p-4 transition-all duration-300 hover:border-accent/15 hover:bg-surface-hover">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
            {label}
          </span>
          <span className="text-sm opacity-40 transition-opacity group-hover:opacity-70">
            {icon}
          </span>
        </div>
        <div className="mt-2 flex items-end justify-between">
          <p
            className={`text-2xl font-bold tracking-tight ${
              accent ? "text-rose-400" : "text-foreground"
            }`}
          >
            {value}
          </p>
          {sparkData && sparkData.length > 1 && (
            <SparkMini data={sparkData} color={sparkColor} />
          )}
        </div>
        {sub && <p className="mt-1 text-[10px] text-muted-dim">{sub}</p>}
      </div>
    </div>
  );
}

function SparkMini({ data, color }: { data: number[]; color?: string }) {
  const h = 24;
  const w = 48;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((val - min) / range) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`sm-${color?.replace("#", "") ?? "a"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color ?? "#a855f7"} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color ?? "#a855f7"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill={`url(#sm-${color?.replace("#", "") ?? "a"})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color ?? "#a855f7"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
