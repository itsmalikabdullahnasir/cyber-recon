"use client";

import { Donut, BarList } from "@/components/charts";
import { RiskScoreGauge } from "@/components/RiskScoreGauge";
import { useMemo, useState } from "react";

type ActivityPoint = { date: string; queued: number; running: number; done: number; failed: number };

export function DashboardCharts({
  severityData,
  findings,
  scanCount,
  riskScore,
  activity,
  activity24h,
}: {
  severityData: { label: string; value: number; color: string }[];
  findings: number | null;
  scanCount: number | null;
  riskScore: number;
  activity: ActivityPoint[];
  activity24h: ActivityPoint[];
}) {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const points = useMemo(() => range === "24h" ? activity24h : activity.slice(range === "7d" ? -7 : -30), [activity, activity24h, range]);
  const max = Math.max(1, ...points.map((point) => point.done + point.failed + point.running + point.queued));
  return (
    <div className="animate-fade-in grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="card card-hover p-5">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Findings by severity</p>
        <div className="flex items-center gap-5">
          <Donut data={severityData.filter((d) => d.value > 0)} centerValue={findings ?? "—"} centerLabel="findings" />
          <div className="flex-1">
            <BarList data={severityData} />
          </div>
        </div>
      </div>

      <div className="card card-hover p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Scan activity · {range}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-dim">{scanCount} total</span>
            <select value={range} onChange={(event) => setRange(event.target.value as typeof range)} className="rounded border border-white/10 bg-background px-1.5 py-1 text-[10px]">
              <option value="24h">24h</option><option value="7d">7d</option><option value="30d">30d</option>
            </select>
          </div>
        </div>
        <div className="flex h-[120px] items-end gap-1">
          {points.map((point) => {
            const total = point.done + point.failed + point.running + point.queued;
            return (
              <div key={point.date} className="group relative flex h-full flex-1 items-end" title={`${point.date}: ${total} scans, ${point.done} completed, ${point.failed} failed`}>
                <div className="w-full rounded-t bg-accent/70 transition-all group-hover:bg-accent" style={{ height: `${Math.max(3, (total / max) * 100)}%` }} />
                {point.failed > 0 && <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-rose-300" />}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-3 text-[10px] text-muted-dim"><span>■ completed/active</span><span className="text-rose-300">● failed</span></div>
      </div>

      <div className="card card-hover flex items-center justify-center p-5">
        <RiskScoreGauge score={riskScore} label="risk score" />
      </div>
    </div>
  );
}
