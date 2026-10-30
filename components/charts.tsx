"use client";

// Lightweight, theme-aware SVG charts — no external chart library.
// Colors come from props (hex) so they work in light and dark mode.

import { useId } from "react";

export function Donut({
  data,
  size = 150,
  thickness = 14,
  centerValue,
  centerLabel,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerValue?: string | number;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={thickness} className="text-white/[0.04]" />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * c;
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                style={{ transition: "stroke-dasharray 0.6s ease" }}
              />
            );
            offset += len;
            return seg;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {centerValue !== undefined && <span className="text-2xl font-bold leading-none">{centerValue}</span>}
        {centerLabel && <span className="mt-1 text-[9px] uppercase tracking-widest text-muted-dim">{centerLabel}</span>}
      </div>
    </div>
  );
}

export function AreaChart({
  points,
  color = "#a855f7",
  height = 64,
  className = "",
}: {
  points: number[];
  color?: string;
  height?: number;
  className?: string;
}) {
  const id = useId();
  const w = 100;
  const max = Math.max(1, ...points);
  const n = points.length;
  const coords = points.map((p, i) => {
    const x = n <= 1 ? 0 : (i / (n - 1)) * w;
    const y = height - (p / max) * (height - 6) - 3;
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height }}>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {coords.length > 0 && (
        <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2" fill={color} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

// Horizontal labelled bars — good for severity / status breakdowns.
export function BarList({
  data,
  className = "",
}: {
  data: { label: string; value: number; color: string }[];
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-[11px]">
          <span className="w-20 shrink-0 text-muted-dim">{d.label}</span>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color, transition: "width 0.6s ease" }}
            />
          </div>
          <span className="w-6 shrink-0 text-right font-mono tabular-nums">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
