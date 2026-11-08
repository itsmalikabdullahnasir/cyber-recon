"use client";

import type { Finding, Host, Scan, Target } from "@/lib/types";

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
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
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function buildExecutiveHtml(target: Target, hosts: Host[], findings: Finding[], scans: Scan[]): string {
  const critical = findings.filter((finding) => finding.severity === "Critical").length;
  const high = findings.filter((finding) => finding.severity === "High").length;
  const rows = findings.slice(0, 100).map((finding) => `
    <tr><td>${escapeHtml(finding.severity)}</td><td>${escapeHtml(finding.cve_id ?? finding.title)}</td>
    <td>${escapeHtml(hosts.find((host) => host.id === finding.host_id)?.ip ?? "Unassigned")}</td>
    <td>${escapeHtml(finding.affected_url ?? "—")}</td><td>${escapeHtml(finding.status)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(target.name)} executive report</title>
    <style>body{font:14px Arial,sans-serif;color:#172033;max-width:1100px;margin:40px auto;padding:0 24px}
    h1{margin-bottom:4px}small{color:#667085}.stats{display:flex;gap:12px;margin:24px 0}.stat{border:1px solid #d0d5dd;border-radius:8px;padding:14px;min-width:120px}.value{font-size:26px;font-weight:700;display:block}
    table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;border-bottom:1px solid #eaecf0;padding:9px}th{background:#f9fafb}.critical{color:#b42318}</style></head>
    <body><h1>${escapeHtml(target.name)} — Executive Security Report</h1><small>Generated ${escapeHtml(new Date().toLocaleString())} · ${escapeHtml(target.domain ?? target.ip_range ?? "")}</small>
    <div class="stats"><div class="stat"><span class="value">${hosts.length}</span>Hosts</div><div class="stat"><span class="value">${findings.length}</span>Findings</div><div class="stat"><span class="value critical">${critical}</span>Critical</div><div class="stat"><span class="value">${high}</span>High</div><div class="stat"><span class="value">${scans.length}</span>Recent scans</div></div>
    <h2>Findings requiring attention</h2><table><thead><tr><th>Severity</th><th>Finding</th><th>IP</th><th>Affected URL</th><th>Status</th></tr></thead><tbody>${rows || "<tr><td colspan=\"5\">No findings recorded.</td></tr>"}</tbody></table>
    <p><small>This report contains the first 100 findings shown for this asset. Use the detailed workbench for complete exports.</small></p>
    <button onclick="window.print()">Print / Save as PDF</button></body></html>`;
}

export function ReportActions({ target, hosts, findings, scans }: {
  target: Target; hosts: Host[]; findings: Finding[]; scans: Scan[];
}) {
  function exportHostReport() {
    const header = ["ip", "hostname", "status", "open_ports", "technologies", "finding_count", "critical", "high"];
    const rows = hosts.map((host) => {
      const related = findings.filter((finding) => finding.host_id === host.id);
      return [host.ip, host.hostname, host.status, host.open_ports, host.tech?.join("; ") ?? host.services,
        related.length, related.filter((finding) => finding.severity === "Critical").length,
        related.filter((finding) => finding.severity === "High").length].map(csvCell).join(",");
    });
    download(`${target.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-host-vulnerabilities.csv`,
      [header.join(","), ...rows].join("\n"), "text/csv");
  }

  function openExecutiveReport() {
    const report = window.open("", "_blank");
    if (!report) return;
    report.document.write(buildExecutiveHtml(target, hosts, findings, scans));
    report.document.close();
  }

  return <div className="flex flex-wrap gap-2">
    <button type="button" onClick={exportHostReport} className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-muted hover:text-foreground">Host report CSV</button>
    <button type="button" onClick={openExecutiveReport} className="rounded-md border border-accent/20 px-2.5 py-1.5 text-[11px] text-accent hover:bg-accent/10">Executive report / PDF</button>
  </div>;
}
