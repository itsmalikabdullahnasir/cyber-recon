"use client";

// Lightweight, theme-aware SVG charts — no external chart library.
// Colors come from props (hex) so they work in light and dark mode. Enhanced
// with smooth curves, soft glows, gradient fills and a draw-in animation.

import { useId, useState } from "react";

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
  const [hovered, setHovered] = useState<number | null>(null);
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
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ transition: "stroke-dasharray .6s ease", filter: `drop-shadow(0 0 5px ${d.color}66)`, opacity: hovered === null || hovered === i ? 1 : 0.35 }}
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
      {hovered !== null && (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-md border border-white/10 bg-surface-raised px-2 py-1 text-[10px] shadow-lg">
          {data[hovered].label}: <span className="font-semibold">{data[hovered].value}</span>
        </div>
      )}
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
  const pad = 4;
  const coords = points.map((p, i) => {
    const x = n <= 1 ? w / 2 : (i / (n - 1)) * w;
    const y = height - (p / max) * (height - pad * 2) - pad;
    return [x, y] as const;
  });
  const line = coords.length ? smoothPath(coords) : "";
  const area = line ? `${line} L${w},${height} L0,${height} Z` : "";
  const last = coords[coords.length - 1];
  const [hovered, setHovered] = useState<number | null>(null);

  // The marker tracks the hovered point, or the latest point at rest.
  const markIdx = hovered ?? n - 1;
  const mark = coords[markIdx];
  // Position overlays as percentages of the box. The SVG paths are stretched
  // with preserveAspectRatio="none", but these HTML overlays are not — so dots
  // stay perfectly round instead of smearing into ellipses.
  const pctX = (v: number) => `${Math.min(Math.max((v / w) * 100, 0), 100)}%`;
  const pctY = (v: number) => `${Math.min(Math.max((v / height) * 100, 0), 100)}%`;

  return (
    <div className={`relative w-full ${className}`} style={{ height }}>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill={`url(#g-${id})`} />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Round marker (HTML overlay — cannot be stretched by the SVG scaling). */}
      {mark && (
        <span
          className="pointer-events-none absolute z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: pctX(mark[0]), top: pctY(mark[1]), background: color, boxShadow: `0 0 0 3px ${color}33` }}
        />
      )}

      {/* Invisible hover columns, one per point, so the whole width is hoverable. */}
      <div className="absolute inset-0 flex">
        {coords.map((_, i) => (
          <div
            key={i}
            className="h-full flex-1 cursor-help"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </div>

      {hovered !== null && coords[hovered] && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-white/10 bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-lg"
          style={{ left: pctX(coords[hovered][0]), top: pctY(coords[hovered][1]), marginTop: -8 }}
        >
          {points[hovered]}
        </div>
      )}
    </div>
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
  const [hovered, setHovered] = useState<string | null>(null);
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
              onMouseEnter={() => setHovered(d.label)}
              onMouseLeave={() => setHovered(null)}
            />
          </div>
          <span className="w-6 shrink-0 text-right font-mono tabular-nums">{d.value}</span>
          {hovered === d.label && <span className="text-[9px] text-accent">{d.value}</span>}
        </div>
      ))}
    </div>
  );
}
