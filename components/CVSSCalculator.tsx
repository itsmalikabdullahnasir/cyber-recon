"use client";

import { useState, useMemo } from "react";

interface CVSSValues {
  av: string;
  ac: string;
  pr: string;
  ui: string;
  s: string;
  c: string;
  i: string;
  a: string;
}

const CVSS_OPTIONS = {
  av: [
    { value: "N", label: "Network", score: 0.85 },
    { value: "A", label: "Adjacent", score: 0.62 },
    { value: "L", label: "Local", score: 0.55 },
    { value: "P", label: "Physical", score: 0.20 },
  ],
  ac: [
    { value: "L", label: "Low", score: 0.77 },
    { value: "H", label: "High", score: 0.44 },
  ],
  pr: {
    S: [
      { value: "N", label: "None", score: 0.85 },
      { value: "L", label: "Low", score: 0.68 },
      { value: "H", label: "High", score: 0.50 },
    ],
    U: [
      { value: "N", label: "None", score: 0.85 },
      { value: "L", label: "Low", score: 0.62 },
      { value: "H", label: "High", score: 0.27 },
    ],
  },
  ui: [
    { value: "N", label: "None", score: 0.85 },
    { value: "R", label: "Required", score: 0.62 },
  ],
  s: [
    { value: "U", label: "Unchanged" },
    { value: "C", label: "Changed" },
  ],
  c: [
    { value: "N", label: "None", score: 0.00 },
    { value: "L", label: "Low", score: 0.22 },
    { value: "H", label: "High", score: 0.56 },
  ],
  i: [
    { value: "N", label: "None", score: 0.00 },
    { value: "L", label: "Low", score: 0.22 },
    { value: "H", label: "High", score: 0.56 },
  ],
  a: [
    { value: "N", label: "None", score: 0.00 },
    { value: "L", label: "Low", score: 0.22 },
    { value: "H", label: "High", score: 0.56 },
  ],
};

function calcCVSS(v: CVSSValues): number {
  const getScore = (metric: string, values: { value: string; score: number }[]) =>
    values.find((o) => o.value === metric)?.score ?? 0;

  const avScore = getScore(v.av, CVSS_OPTIONS.av);
  const acScore = getScore(v.ac, CVSS_OPTIONS.ac);
  const prValues = CVSS_OPTIONS.pr[v.s as keyof typeof CVSS_OPTIONS.pr];
  const prScore = getScore(v.pr, prValues);
  const uiScore = getScore(v.ui, CVSS_OPTIONS.ui);
  const cScore = getScore(v.c, CVSS_OPTIONS.c);
  const iScore = getScore(v.i, CVSS_OPTIONS.i);
  const aScore = getScore(v.a, CVSS_OPTIONS.a);

  const impactSub = 1 - (1 - cScore) * (1 - iScore) * (1 - aScore);
  const impact = v.s === "C" ? 7.52 * (impactSub - 0.029) - 3.25 * Math.pow(impactSub - 0.02, 15) : 6.42 * impactSub;

  const exploitability = 8.22 * avScore * acScore * prScore * uiScore;

  if (impact <= 0) return 0;

  const base = v.s === "C"
    ? Math.min(1.08 * (impact + exploitability), 10)
    : Math.min(impact + exploitability, 10);

  return Math.ceil(base * 10) / 10;
}

function getScoreColor(score: number): string {
  if (score >= 9.0) return "text-rose-400";
  if (score >= 7.0) return "text-pink-400";
  if (score >= 4.0) return "text-amber-400";
  if (score > 0) return "text-indigo-400";
  return "text-zinc-400";
}

function getScoreLabel(score: number): string {
  if (score >= 9.0) return "Critical";
  if (score >= 7.0) return "High";
  if (score >= 4.0) return "Medium";
  if (score > 0) return "Low";
  return "None";
}

export function CVSSCalculator({
  onSelect,
}: {
  onSelect?: (score: number, vector: string) => void;
}) {
  const [values, setValues] = useState<CVSSValues>({
    av: "N", ac: "L", pr: "N", ui: "N", s: "U", c: "N", i: "N", a: "N",
  });

  const score = useMemo(() => calcCVSS(values), [values]);
  const label = getScoreLabel(score);

  const vector = `CVSS:3.1/AV:${values.av}/AC:${values.ac}/PR:${values.pr}/UI:${values.ui}/S:${values.s}/C:${values.c}/I:${values.i}/A:${values.a}`;

  function update(key: keyof CVSSValues, value: string) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "s") next.pr = "N";
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-white/5 bg-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-dim">CVSS 3.1 Calculator</h3>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score.toFixed(1)}</span>
          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
            score >= 9.0 ? "border-rose-500/20 bg-rose-500/8 text-rose-400" :
            score >= 7.0 ? "border-pink-500/20 bg-pink-500/8 text-pink-400" :
            score >= 4.0 ? "border-amber-500/20 bg-amber-500/8 text-amber-400" :
            score > 0 ? "border-indigo-500/20 bg-indigo-500/8 text-indigo-400" :
            "border-zinc-500/20 bg-zinc-500/8 text-zinc-400"
          }`}>{label}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(CVSS_OPTIONS) as (keyof typeof CVSS_OPTIONS)[]).map((metric) => {
          const options = metric === "pr" ? CVSS_OPTIONS.pr[values.s as keyof typeof CVSS_OPTIONS.pr] : CVSS_OPTIONS[metric as keyof typeof CVSS_OPTIONS] as { value: string; label: string; score?: number }[];
          return (
            <div key={metric} className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">
                {metric.toUpperCase()}
              </label>
              <div className="flex flex-wrap gap-1">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update(metric as keyof CVSSValues, opt.value)}
                    className={`rounded px-2 py-1 text-[10px] font-medium transition-all ${
                      values[metric as keyof CVSSValues] === opt.value
                        ? "bg-accent/15 text-accent border border-accent/30"
                        : "border border-white/5 text-muted-dim hover:border-white/10 hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 rounded bg-background px-3 py-1.5 font-mono text-[10px] text-muted-dim">
          {vector}
        </code>
        <button
          onClick={() => navigator.clipboard.writeText(vector)}
          className="rounded px-2 py-1.5 text-[10px] text-muted-dim hover:text-foreground"
        >
          Copy
        </button>
        {onSelect && (
          <button
            onClick={() => onSelect(score, vector)}
            className="rounded-md bg-gradient-to-r from-accent to-fuchsia px-3 py-1.5 text-[10px] font-semibold text-white hover:shadow-[0_0_12px_rgba(168,85,247,0.3)]"
          >
            Use score
          </button>
        )}
      </div>
    </div>
  );
}
