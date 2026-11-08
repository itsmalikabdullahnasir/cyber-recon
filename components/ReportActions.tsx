"use client";

import { useState } from "react";
import type { Finding, Host, Scan, Target } from "@/lib/types";

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[character] ?? character)
  );
}

function buildExecutiveHtml(
  target: Target,
  hosts: Host[],
  findings: Finding[],
  scans: Scan[]
): string {
  const critical = findings.filter((f) => f.severity === "Critical").length;
  const high = findings.filter((f) => f.severity === "High").length;
  const medium = findings.filter((f) => f.severity === "Medium").length;
  const low = findings.filter((f) => f.severity === "Low").length;
  const fixed = findings.filter((f) => f.status === "Fixed").length;
  const total = findings.length;
  const fixRate = total > 0 ? Math.round((fixed / total) * 100) : 100;

  const rows = findings.slice(0, 150).map((finding) => {
    const host = hosts.find((h) => h.id === finding.host_id);
    return `
    <tr>
      <td><span class="badge ${finding.severity.toLowerCase()}">${escapeHtml(finding.severity)}</span></td>
      <td><strong>${escapeHtml(finding.title)}</strong><br/><small class="text-muted">${escapeHtml(finding.cve_id ?? "No CVE")}</small></td>
      <td><code>${escapeHtml(host?.ip ?? "Unassigned")}</code><br/><small class="text-muted">${escapeHtml(host?.hostname ?? "")}</small></td>
      <td><code class="url">${escapeHtml(finding.affected_url ?? "—")}</code></td>
      <td><span class="status-badge">${escapeHtml(finding.status)}</span></td>
    </tr>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(target.name)} — Executive Security Reconnaissance Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #fff; line-height: 1.5; padding: 40px; max-width: 1100px; margin: 0 auto; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    .brand { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; }
    h1 { font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 4px; }
    .meta { font-size: 12px; color: #64748b; margin-top: 4px; }
    .print-btn { background: #0f172a; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin: 24px 0; }
    .stat { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; background: #f8fafc; }
    .stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; }
    .stat-value { font-size: 24px; font-weight: 800; margin-top: 4px; display: block; }
    .critical-val { color: #dc2626; }
    .high-val { color: #ea580c; }
    .fixed-val { color: #16a34a; }
    h2 { font-size: 16px; font-weight: 700; color: #0f172a; margin: 32px 0 12px; border-left: 3px solid #0f172a; padding-left: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th { text-align: left; background: #f1f5f9; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 1px solid #cbd5e1; }
    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    code { font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; font-size: 11px; background: #f1f5f9; padding: 2px 4px; border-radius: 4px; }
    .url { word-break: break-all; max-width: 320px; display: inline-block; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .badge.critical { background: #fee2e2; color: #991b1b; }
    .badge.high { background: #ffedd5; color: #9a3412; }
    .badge.medium { background: #fef3c7; color: #92400e; }
    .badge.low { background: #e0f2fe; color: #075985; }
    .badge.info { background: #f1f5f9; color: #475569; }
    .status-badge { font-size: 11px; font-weight: 600; color: #334155; }
    .text-muted { color: #64748b; font-size: 11px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 0; }
      .print-btn { display: none; }
      .footer { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Cyber Recon · Attack Surface Assessment</div>
      <h1>${escapeHtml(target.name)}</h1>
      <div class="meta">
        Scope Target: <strong>${escapeHtml(target.domain ?? target.ip_range ?? "Target Scope")}</strong> · 
        Assessment Date: ${escapeHtml(new Date().toLocaleDateString())} · 
        Scans Executed: ${scans.length}
      </div>
    </div>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-label">Hosts Live</div><span class="stat-value">${hosts.length}</span></div>
    <div class="stat"><div class="stat-label">Total Findings</div><span class="stat-value">${total}</span></div>
    <div class="stat"><div class="stat-label">Critical</div><span class="stat-value critical-val">${critical}</span></div>
    <div class="stat"><div class="stat-label">High / Med / Low</div><span class="stat-value high-val">${high} / ${medium} / ${low}</span></div>
    <div class="stat"><div class="stat-label">Fixed Issues</div><span class="stat-value fixed-val">${fixed}</span></div>
    <div class="stat"><div class="stat-label">Remediation Rate</div><span class="stat-value">${fixRate}%</span></div>
  </div>

  <h2>Identified Security Findings</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 80px;">Severity</th>
        <th>Vulnerability / Advisory</th>
        <th>Asset IP / Host</th>
        <th>Affected URL</th>
        <th style="width: 90px;">Lifecycle</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5">No findings detected during active assessment.</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    <span>CONFIDENTIAL · Generated by Cyber Recon Platform</span>
    <span>Page 1 of 1 · Authorized Penetration Testing &amp; Attack Surface Intelligence</span>
  </div>
</body>
</html>`;
}

export function ReportActions({
  target,
  hosts,
  findings,
  scans,
}: {
  target: Target;
  hosts: Host[];
  findings: Finding[];
  scans: Scan[];
}) {
  const [copiedLink, setCopiedLink] = useState(false);

  function exportHostReport() {
    const header = [
      "ip",
      "hostname",
      "status",
      "open_ports",
      "technologies",
      "finding_count",
      "critical",
      "high",
      "risk_score",
    ];
    const rows = hosts.map((host) => {
      const related = findings.filter((finding) => finding.host_id === host.id);
      return [
        host.ip,
        host.hostname,
        host.status,
        host.open_ports,
        host.tech?.join("; ") ?? host.services,
        related.length,
        related.filter((f) => f.severity === "Critical").length,
        related.filter((f) => f.severity === "High").length,
        host.risk_score ?? 0,
      ]
        .map(csvCell)
        .join(",");
    });
    download(
      `${target.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-host-inventory.csv`,
      [header.join(","), ...rows].join("\n"),
      "text/csv"
    );
  }

  function exportRemediationReport() {
    const header = [
      "title",
      "severity",
      "status",
      "cve_id",
      "cvss",
      "host_ip",
      "affected_url",
      "remediation",
      "created_at",
    ];
    const rows = findings.map((f) => {
      const host = hosts.find((h) => h.id === f.host_id);
      return [
        f.title,
        f.severity,
        f.status,
        f.cve_id ?? "",
        f.cvss ?? "",
        host?.ip ?? "unassigned",
        f.affected_url ?? "",
        f.remediation ?? "",
        f.created_at,
      ]
        .map(csvCell)
        .join(",");
    });
    download(
      `${target.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-remediation-actions.csv`,
      [header.join(","), ...rows].join("\n"),
      "text/csv"
    );
  }

  function exportVerificationReport() {
    const fixedFindings = findings.filter((f) => f.status === "Fixed");
    const openFindings = findings.filter((f) => f.status !== "Fixed" && f.status !== "False Positive");
    const summary = [
      `Target: ${target.name} (${target.domain ?? "n/a"})`,
      `Verification Date: ${new Date().toISOString()}`,
      `Verified Fixed: ${fixedFindings.length}`,
      `Remaining Open: ${openFindings.length}`,
      `Remediation Ratio: ${findings.length ? Math.round((fixedFindings.length / findings.length) * 100) : 100}%`,
      "",
      "--- VERIFIED FIXED VULNERABILITIES ---",
      ...fixedFindings.map(
        (f) => `[FIXED] ${f.severity} - ${f.title} (${hosts.find((h) => h.id === f.host_id)?.ip ?? "host"})`
      ),
      "",
      "--- OUTSTANDING EXPOSURES ---",
      ...openFindings.map(
        (f) => `[OPEN] ${f.severity} - ${f.title} (${hosts.find((h) => h.id === f.host_id)?.ip ?? "host"})`
      ),
    ].join("\n");

    download(
      `${target.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-verification-report.txt`,
      summary,
      "text/plain"
    );
  }

  function openExecutiveReport() {
    const report = window.open("", "_blank");
    if (!report) return;
    report.document.write(buildExecutiveHtml(target, hosts, findings, scans));
    report.document.close();
  }

  function copyReportSummary() {
    const critical = findings.filter((f) => f.severity === "Critical").length;
    const high = findings.filter((f) => f.severity === "High").length;
    const summary = `🛡️ **Cyber Recon Executive Summary: ${target.name}**\n- Domain: ${target.domain ?? "N/A"}\n- Hosts Live: ${hosts.length}\n- Findings Total: ${findings.length}\n- Critical: ${critical} | High: ${high}\n- Assessment Generated: ${new Date().toLocaleString()}`;
    void navigator.clipboard.writeText(summary);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={exportHostReport}
        className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted hover:text-foreground hover:bg-white/5"
      >
        Host Inventory CSV
      </button>

      <button
        type="button"
        onClick={exportRemediationReport}
        className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted hover:text-foreground hover:bg-white/5"
      >
        Remediation Plan CSV
      </button>

      <button
        type="button"
        onClick={exportVerificationReport}
        className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted hover:text-foreground hover:bg-white/5"
      >
        Verification Report
      </button>

      <button
        type="button"
        onClick={copyReportSummary}
        className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted hover:text-foreground hover:bg-white/5"
      >
        {copiedLink ? "Copied Summary!" : "Copy Summary"}
      </button>

      <button
        type="button"
        onClick={openExecutiveReport}
        className="rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent hover:bg-accent/20"
      >
        Executive Branded Report / PDF
      </button>
    </div>
  );
}
