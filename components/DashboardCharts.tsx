"use client";

import { Donut, AreaChart, BarList } from "@/components/charts";
import { RiskScoreGauge } from "@/components/RiskScoreGauge";

export function DashboardCharts({
  severityData,
  findings,
  scanSeries,
  scanCount,
  riskScore,
}: {
  severityData: { label: string; value: number; color: string }[];
  findings: number | null;
  scanSeries: number[];
  scanCount: number | null;
  riskScore: number;
}) {
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
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Scan activity · 14d</p>
          <span className="text-[10px] text-muted-dim">{scanCount} total</span>
        </div>
        <AreaChart points={scanSeries} height={120} color="#a855f7" />
        <p className="mt-2 text-[10px] text-muted-dim">
          {scanSeries[scanSeries.length - 1]} today · peak {Math.max(...scanSeries)}/day
        </p>
      </div>

      <div className="card card-hover flex items-center justify-center p-5">
        <RiskScoreGauge score={riskScore} label="risk score" />
      </div>
    </div>
  );
}
