"use client";

export function RiskScoreGauge({
  score,
  label,
}: {
  score: number;
  label?: string;
}) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80) return { stroke: "#f43f5e", glow: "rgba(244,63,94,0.3)" };
    if (s >= 60) return { stroke: "#f59e0b", glow: "rgba(245,158,11,0.3)" };
    if (s >= 40) return { stroke: "#d946ef", glow: "rgba(217,70,239,0.3)" };
    return { stroke: "#a855f7", glow: "rgba(168,85,247,0.3)" };
  };

  const color = getColor(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[120px] w-[120px]">
        <svg
          className="h-full w-full -rotate-90"
          viewBox="0 0 100 100"
        >
          {/* Background track */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="rgba(168,85,247,0.08)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Gradient definition */}
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="50%" stopColor="#d946ef" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          {/* Value arc */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              filter: `drop-shadow(0 0 6px ${color.glow})`,
              animation: "gauge-fill 1s ease-out forwards",
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-2xl font-bold"
            style={{ color: color.stroke }}
          >
            {score}%
          </span>
          {label && (
            <span className="text-[9px] uppercase tracking-wider text-muted-dim">
              {label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
