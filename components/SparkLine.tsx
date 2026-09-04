"use client";

export function SparkLine({
  data,
  color,
  height,
  width,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  const h = height ?? 40;
  const w = width ?? 100;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((val - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`sparkGrad-${color?.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color ?? "#a855f7"} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color ?? "#a855f7"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#sparkGrad-${color?.replace("#", "")})`}
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
