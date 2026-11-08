import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const SHODAN_API_KEY = process.env.SHODAN_API_KEY;

async function tryShodanHost(ip: string) {
  if (!SHODAN_API_KEY) throw new Error("SHODAN_API_KEY is not configured");
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

async function searchNVD(keyword: string) {
  const res = await fetch(
    `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=5`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.vulnerabilities || []).map((v: any) => {
    const cve = v.cve;
    const metrics = cve.metrics?.cvssMetricV31?.[0]?.cvssData ||
                    cve.metrics?.cvssMetricV30?.[0]?.cvssData ||
                    cve.metrics?.cvssMetricV2?.[0]?.cvssData || {};
    return {
      id: cve.id,
      description: cve.descriptions?.find((d: any) => d.lang === "en")?.value || "",
      cvss: metrics.baseScore || null,
      severity: metrics.baseSeverity || null,
      vector: metrics.vectorString || null,
      published: cve.published,
      references: (cve.references || []).slice(0, 3).map((r: any) => r.url),
    };
  });
}

async function lookupCVEsForServices(services: { product: string; version: string; port: number }[]) {
  const queries: string[] = [];
  for (const s of services) {
    if (s.product && s.product !== "unknown") {
      const q = s.version ? `${s.product} ${s.version}` : s.product;
      if (!queries.includes(q)) queries.push(q);
    }
  }

  const results: Record<string, any[]> = {};
  // Limit to top 2 distinct services to stay well within serverless timeouts
  const topQueries = queries.slice(0, 2);
  for (let i = 0; i < topQueries.length; i++) {
    const q = topQueries[i];
    try {
      const cves = await searchNVD(q);
      if (cves.length > 0) results[q] = cves;
      // Delay briefly only between queries
      if (i < topQueries.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    } catch {
      // Skip failed queries
    }
  }
  return results;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { ip, skipCVE } = await request.json();

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
      try {
        data = await tryInternetDB(sanitized);
        source = "internetdb";
      } catch {
        return NextResponse.json(
          { error: shodanErr.message || "Shodan lookup failed" },
          { status: 402 }
        );
      }
    }

    let ports: number[];
    let services: { port: number; protocol: string; product: string; version: string; banner: string }[];
    let shodanVulns: string[];
    let hostname: string;
    let os: string | null;
    let country: string | null;
    let city: string | null;
    let isp: string | null;
    let org: string | null;

    if (source === "internetdb") {
      ports = data.ports || [];
      services = ports.map((p: number) => ({
        port: p, protocol: "tcp", product: "", version: "", banner: "",
      }));
      shodanVulns = [...(data.vulns || []), ...(data.cpes || [])];
      hostname = "";
      os = null; country = null; city = null; isp = null; org = null;
    } else {
      ports = (data.ports || []).map((p: number) => p);
      services = (data.data || []).map((s: any) => ({
        port: s.port,
        protocol: s.transport || "tcp",
        product: s.product || "",
        version: s.version || "",
        banner: (s.data || "").slice(0, 200),
      }));
      shodanVulns = data.vulns || [];
      hostname = data.hostnames?.[0] || "";
      os = data.os?.name || null;
      country = data.country_name || null;
      city = data.city || null;
      isp = data.isp || null;
      org = data.org || null;
    }

    // Lookup CVEs from NVD based on discovered tech stack
    let techCVEs: Record<string, any[]> = {};
    if (!skipCVE && services.some((s) => s.product)) {
      techCVEs = await lookupCVEsForServices(services);
    }

    return NextResponse.json({
      ip: sanitized,
      hostname,
      os,
      country,
      city,
      isp,
      organization: org,
      ports,
      services,
      vulnerabilities: shodanVulns,
      techCVEs,
      lastUpdate: source === "shodan" ? data.last_update : null,
      source,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Shodan lookup failed" },
      { status: 500 }
    );
  }
}
