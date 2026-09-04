import { NextResponse } from "next/server";

const SHODAN_API_KEY = "R62MM7So0B1QCEglLyVTX0j0k1XCKRGb";

export async function POST(request: Request) {
  try {
    const { ip } = await request.json();

    if (!ip) {
      return NextResponse.json({ error: "IP is required" }, { status: 400 });
    }

    const sanitized = ip.replace(/[^a-zA-Z0-9.\-]/g, "");
    const res = await fetch(
      `https://api.shodan.io/shodan/host/${sanitized}?key=${SHODAN_API_KEY}`
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error || `Shodan returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    const ports = (data.ports || []).map((p: number) => p);
    const services = (data.data || []).map((s: any) => ({
      port: s.port,
      protocol: s.transport || "tcp",
      product: s.product || "",
      version: s.version || "",
      banner: (s.data || "").slice(0, 200),
    }));

    return NextResponse.json({
      ip: data.ip_str,
      hostname: data.hostnames?.[0] || "",
      os: data.os?.name || null,
      country: data.country_name || null,
      city: data.city || null,
      isp: data.isp || null,
      organization: data.org || null,
      ports,
      services,
      vulnerabilities: data.vulns || [],
      lastUpdate: data.last_update,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Shodan lookup failed" },
      { status: 500 }
    );
  }
}
