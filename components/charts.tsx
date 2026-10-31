"use client";

// Lightweight, theme-aware SVG charts — no external chart library.
// Colors come from props (hex) so they work in light and dark mode. Enhanced
// with smooth curves, soft glows, gradient fills and a draw-in animation.

import { useId } from "react";

// Catmull-Rom → cubic-bezier smoothing for a flowing line.
function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

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
  const gap = total > 0 && data.length > 1 ? Math.min(6, c * 0.015) : 0; // breathing room between segments
  let offset = 0;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={thickness} className="text-white/[0.05]" />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * c;
            const draw = Math.max(0, len - gap);
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={`${draw} ${c - draw}`}
                strokeDashoffset={-offset}
                style={{ transition: "stroke-dasharray .6s ease", filter: `drop-shadow(0 0 5px ${d.color}66)` }}
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
  const line = smoothPath(coords);
  const area = coords.length ? `${line} L${w},${height} L0,${height} Z` : "";
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height, overflow: "visible" }}>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="60%" stopColor={color} stopOpacity="0.08" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#g-${id})`} />}
      {line && (
        <path
          d={line}
          className="chart-line"
          pathLength={100}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: `drop-shadow(0 0 3px ${color}88)` }}
        />
      )}
      {last && (
        <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
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
              style={{
                width: `${(d.value / max) * 100}%`,
                background: `linear-gradient(90deg, ${d.color}99, ${d.color})`,
                boxShadow: `0 0 8px ${d.color}66`,
                transition: "width 0.6s ease",
              }}
            />
          </div>
          <span className="w-6 shrink-0 text-right font-mono tabular-nums">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
