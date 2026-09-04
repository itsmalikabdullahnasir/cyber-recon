import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { target, flags } = await request.json();

    if (!target) {
      return NextResponse.json({ error: "Target is required" }, { status: 400 });
    }

    // Sanitize target to prevent command injection
    const sanitized = target.replace(/[^a-zA-Z0-9.\-\/\s:]/g, "");
    const safeFlags = (flags || "-sV").replace(/[^a-zA-Z0-9\s\-]/g, "");

    const cmd = `nmap ${safeFlags} ${sanitized} -oX -`;

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 120000, // 2 min timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Parse XML output
    const results = parseNmapXml(stdout);

    return NextResponse.json({
      results,
      raw: stdout,
    });
  } catch (error: any) {
    if (error.killed) {
      return NextResponse.json(
        { error: "Scan timed out (2 min limit)" },
        { status: 408 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Scan failed. Is nmap installed?" },
      { status: 500 }
    );
  }
}

function parseNmapXml(xml: string) {
  const results: any[] = [];

  // Simple regex-based XML parsing (no dependencies needed)
  const hostBlocks = xml.match(/<host[^>]*>[\s\S]*?<\/host>/g) || [];

  for (const block of hostBlocks) {
    const ipMatch = block.match(/<address addr="([^"]+)"/);
    const hostnameMatch = block.match(/<hostname name="([^"]+)"/);
    const statusMatch = block.match(/<status state="([^"]+)"/);
    const osMatch = block.match(/<osmatch name="([^"]+)"/);

    const ports: any[] = [];
    const portBlocks = block.match(/<port[^>]*>[\s\S]*?<\/port>/g) || [];
    for (const portBlock of portBlocks) {
      const portId = portBlock.match(/portid="(\d+)"/);
      const protocol = portBlock.match(/protocol="(\w+)"/);
      const state = portBlock.match(/<state state="([^"]+)"/);
      const service = portBlock.match(/<service name="([^"]+)"/);
      const version = portBlock.match(/product="([^"]*?)".*?version="([^"]*?)"/);

      if (portId) {
        ports.push({
          port: parseInt(portId[1]),
          protocol: protocol?.[1] || "tcp",
          state: state?.[1] || "unknown",
          service: service?.[1] || "unknown",
          version: version ? `${version[1]} ${version[2]}`.trim() : "",
        });
      }
    }

    results.push({
      ip: ipMatch?.[1] || "unknown",
      hostname: hostnameMatch?.[1] || "",
      status: statusMatch?.[1] || "unknown",
      os: osMatch?.[1] || "",
      ports,
    });
  }

  return results;
}
