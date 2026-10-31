import type { Host, Finding } from "@/lib/types";

// Severity weights — higher severities dominate (Critical >> High > Medium > Low).
export const SEV_WEIGHT: Record<string, number> = {
  Critical: 40,
  High: 20,
  Medium: 8,
  Low: 2,
  Info: 0,
};

// Single 0–100 risk score for a scan (or a whole group), weighted by FINDINGS
// and combined with the worst host's machine-computed risk_score.
//
// Formula (documented so the number is explainable):
//   findingScore = min(100, Σ SEV_WEIGHT[severity])   // Critical=40 … Info=0, capped
//   hostScore    = max(host.risk_score ?? 0)           // worst host, already 0–100
//   score        = round(0.5 * hostScore + 0.5 * findingScore)   // clamped 0–100
//
// A single Critical finding (40) + one High (20) → findingScore 60; two Criticals
// saturate toward the cap. Hosts contribute the other half so a high-risk host with
// no findings yet still registers.
export function scanRiskScore(hosts: Host[], findings: Finding[]): number {
  if (hosts.length === 0 && findings.length === 0) return 0;
  const findingScore = Math.min(
    100,
    findings.reduce((sum, f) => sum + (SEV_WEIGHT[f.severity] ?? 0), 0),
  );
  const hostScore = hosts.reduce((max, h) => Math.max(max, h.risk_score ?? 0), 0);
  return Math.max(0, Math.min(100, Math.round(0.5 * hostScore + 0.5 * findingScore)));
}

export type RiskTier = { label: string; dot: string; tile: string };

// Reuses the rose / amber / violet thresholds from the existing host-detail risk tile.
export function riskTier(score: number): RiskTier {
  if (score >= 70) return { label: "High", dot: "bg-rose-400", tile: "bg-rose-500/15 text-rose-300" };
  if (score >= 40) return { label: "Medium", dot: "bg-amber-400", tile: "bg-amber-500/15 text-amber-300" };
  return { label: "Low", dot: "bg-violet-400", tile: "bg-violet-500/15 text-violet-300" };
}
