"use client";

import { useId } from "react";

// Blobatar-style avatar: a deterministic organic blob generated from a string
// (email / username), so each user always gets the same unique shape + color,
// with their initial on top. Dependency-free — no npm package, no network.
// Inspired by github.com/Alain00/blobatar (deterministic geometric avatars).

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// Closed Catmull-Rom → bezier loop through the given points (an organic blob).
function smoothClosed(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 3) return "";
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d + " Z";
}

function blobPath(seed: number, size: number, points: number): string {
  const cx = size / 2;
  const cy = size / 2;
  const base = size * 0.4;
  let s = (seed ^ 0x9e3779b9) >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const ang = (i / points) * Math.PI * 2;
    const r = base * (0.78 + rand() * 0.44);
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
  }
  return smoothClosed(pts);
}

export function UserAvatar({
  name,
  size = 24,
  title,
  className = "",
}: {
  name: string;
  size?: number;
  title?: string;
  className?: string;
}) {
  const id = useId();
  const seed = hashStr(name || "?");
  const hue = seed % 360;
  const hue2 = (hue + 40) % 360;
  const points = 6 + (seed % 3); // 6–8 lobes
  const path = blobPath(seed, size, points);
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <span className={`inline-flex shrink-0 ${className}`} title={title ?? name} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <radialGradient id={`b-${id}`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor={`hsl(${hue2} 85% 66%)`} />
            <stop offset="100%" stopColor={`hsl(${hue} 68% 44%)`} />
          </radialGradient>
        </defs>
        <path d={path} fill={`url(#b-${id})`} />
        <text
          x="50%"
          y="52%"
          dominantBaseline="central"
          textAnchor="middle"
          fontSize={size * 0.42}
          fontWeight={700}
          fill="rgba(255,255,255,0.95)"
          fontFamily="var(--font-sans), system-ui, sans-serif"
        >
          {initial}
        </text>
      </svg>
    </span>
  );
}
