"use client";

export function BarChart({
  data,
  colors,
  height,
}: {
  data: { label: string; value: number }[];
  colors?: string[];
  height?: number;
}) {
  const h = height ?? 60;
  const max = Math.max(...data.map((d) => d.value), 1);
  const defaultColors = [
    "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#f59e0b",
    "#818cf8", "#c084fc", "#f472b6",
  ];

  return (
    <div className="flex items-end gap-1" style={{ height: h }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const c = colors?.[i] ?? defaultColors[i % defaultColors.length];
        return (
          <div
            key={d.label}
            className="group relative flex flex-1 items-end justify-center"
            style={{ height: h }}
          >
            <div
              className="w-full rounded-t-sm transition-all duration-500"
              style={{
                height: `${Math.max(pct, 4)}%`,
                background: `linear-gradient(to top, ${c}40, ${c})`,
                boxShadow: `0 0 8px ${c}30`,
                transformOrigin: "bottom",
                animation: "bar-grow 0.6s ease-out forwards",
                animationDelay: `${i * 0.05}s`,
              }}
            />
            <div className="absolute -top-6 hidden rounded bg-surface-raised px-1.5 py-0.5 text-[9px] text-muted group-hover:block">
              {d.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
