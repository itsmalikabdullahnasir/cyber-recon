import { NextResponse } from "next/server";

const SHODAN_API_KEY = "R62MM7So0B1QCEglLyVTX0j0k1XCKRGb";

async function tryShodanHost(ip: string) {
  const res = await fetch(
    `https://api.shodan.io/shodan/host/${ip}?key=${SHODAN_API_KEY}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Shodan returned ${res.status}`);
  }
  return res.json();
}

async function tryInternetDB(ip: string) {
  const res = await fetch(`https://internetdb.shodan.io/${ip}`);
  if (!res.ok) throw new Error(`InternetDB returned ${res.status}`);
  return res.json();
}

export async function POST(request: Request) {
  try {
    const { ip } = await request.json();

    if (!ip) {
      return NextResponse.json({ error: "IP is required" }, { status: 400 });
    }

    const sanitized = ip.replace(/[^a-zA-Z0-9.\-]/g, "");

    // Try full Shodan API first, fall back to free InternetDB
    let data: any;
    let source = "shodan";

    try {
      data = await tryShodanHost(sanitized);
    } catch (shodanErr: any) {
      // If membership required or any Shodan error, try InternetDB (free)
      try {
        data = await tryInternetDB(sanitized);
        source = "internetdb";
      } catch {
        return NextResponse.json(
          { error: shodanErr.message || "Shodan lookup failed. Try InternetDB or check the IP." },
          { status: 402 }
        );
      }
    }

    // Normalize response from either source
    if (source === "internetdb") {
      return NextResponse.json({
        ip: sanitized,
        hostname: "",
        os: null,
        country: null,
        city: null,
        isp: null,
        organization: null,
        ports: data.ports || [],
        services: (data.ports || []).map((p: number) => ({
          port: p,
          protocol: "tcp",
          product: "",
          version: "",
          banner: "",
        })),
        vulnerabilities: [
          ...(data.vulns || []),
          ...(data.cpes || []),
        ],
        lastUpdate: null,
        source: "internetdb",
      });
    }

    // Full Shodan response
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
      source: "shodan",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Shodan lookup failed" },
      { status: 500 }
    );
  }
}
