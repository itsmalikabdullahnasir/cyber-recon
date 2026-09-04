import { NextResponse } from "next/server";

const WHOIS_KEY = "at_KrGgtnDLCPkm2uhg7niUNY2iCv9Sk";

async function fetchJSON(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function lookupBGP(ip: string) {
  try {
    const data = await fetchJSON(`https://ipinfo.io/${ip}/json`);
    return {
      ip: data.ip,
      hostname: data.hostname,
      city: data.city,
      region: data.region,
      country: data.country,
      loc: data.loc,
      org: data.org, // "AS15169 Google LLC"
      postal: data.postal,
      timezone: data.timezone,
    };
  } catch {
    return null;
  }
}

async function detectCDN(url: string) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "CyberRecon-Scanner/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

    const cdns: { name: string; evidence: string }[] = [];

    if (headers["cf-ray"] || headers["cf-cache-status"]) cdns.push({ name: "Cloudflare", evidence: "cf-ray header" });
    if (headers["x-amz-cf-id"] || headers["x-amz-cf-age"]) cdns.push({ name: "AWS CloudFront", evidence: "x-amz-cf-id header" });
    if (headers["x-cdn"]) cdns.push({ name: headers["x-cdn"], evidence: "x-cdn header" });
    if (headers["x-served-by"]?.includes("cache")) cdns.push({ name: "Fastly", evidence: "x-served-by cache" });
    if (headers["x-fastly-request-id"]) cdns.push({ name: "Fastly", evidence: "x-fastly-request-id" });
    if (headers["x-akamai"]) cdns.push({ name: "Akamai", evidence: "x-akamai header" });
    if (headers["server"]?.includes("cloudfront")) cdns.push({ name: "AWS CloudFront", evidence: "server: cloudfront" });
    if (headers["x-azure-ref"]) cdns.push({ name: "Azure CDN", evidence: "x-azure-ref header" });
    if (headers["x-msedge-ref"]) cdns.push({ name: "Azure Front Door", evidence: "x-msedge-ref" });
    if (headers["x-guploader-uploadid"]) cdns.push({ name: "Google Cloud", evidence: "gcloud header" });
    if (headers["via"]?.includes("varnish")) cdns.push({ name: "Varnish", evidence: "via: varnish" });
    if (headers["x-varnish"]) cdns.push({ name: "Varnish", evidence: "x-varnish header" });

    return {
      server: headers["server"] || null,
      poweredBy: headers["x-powered-by"] || null,
      cdns,
      headers,
    };
  } catch {
    return null;
  }
}

async function lookupNetblocks(ip: string) {
  try {
    const data = await fetchJSON(
      `https://www.whoisxmlapi.com/ipnetblocks/api/?apiKey=${WHOIS_KEY}&ip=${ip}&outputFormat=json`
    );
    return data;
  } catch {
    return null;
  }
}

async function lookupDomainHistory(domain: string) {
  try {
    const data = await fetchJSON(
      `https://www.whoisxmlapi.com/whoisserver/WhoisService?domainName=${domain}&apiKey=${WHOIS_KEY}&outputFormat=json&mode=history`
    );
    return data;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { service, target } = await request.json();
    if (!service || !target) {
      return NextResponse.json({ error: "service and target required" }, { status: 400 });
    }

    let data: any;

    switch (service) {
      case "bgp": {
        data = await lookupBGP(target);
        break;
      }
      case "cdn": {
        const url = target.startsWith("http") ? target : `https://${target}`;
        data = await detectCDN(url);
        break;
      }
      case "netblocks": {
        data = await lookupNetblocks(target);
        break;
      }
      case "history": {
        data = await lookupDomainHistory(target);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown service: ${service}` }, { status: 400 });
    }

    return NextResponse.json({ data, service, target });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Request failed" }, { status: 500 });
  }
}
