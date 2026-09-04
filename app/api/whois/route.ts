import { NextResponse } from "next/server";

const API_KEY = "at_KrGgtnDLCPkm2uhg7niUNY2iCv9Sk";

async function fetchJSON(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text).message || JSON.parse(text).error || msg; } catch {}
    throw new Error(msg);
  }
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function POST(request: Request) {
  try {
    const { service, target } = await request.json();
    if (!service || !target) {
      return NextResponse.json({ error: "service and target required" }, { status: 400 });
    }

    let data: any;

    switch (service) {
      case "whois": {
        data = await fetchJSON(
          `https://www.whoisxmlapi.com/whoisserver/WhoisService?domainName=${target}&apiKey=${API_KEY}&outputFormat=json`
        );
        break;
      }
      case "dns": {
        data = await fetchJSON(
          `https://www.whoisxmlapi.com/dnsapi/info/${target}?apiKey=${API_KEY}&outputFormat=json`
        );
        break;
      }
      case "geo": {
        data = await fetchJSON(
          `https://www.whoisxmlapi.com/ip-geolocation-api/json/${target}?apiKey=${API_KEY}&outputFormat=json`
        );
        break;
      }
      case "screenshot": {
        data = await fetchJSON(
          `https://screenshotapi.net/api/v1/screenshot?token=${API_KEY}&url=${target}&full_page=false&output=json&file_format=json&wait_for_event=load`
        );
        break;
      }
      case "ssl": {
        // Try v3 first (more widely available), fallback to v4
        try {
          data = await fetchJSON(
            `https://www.whoisxmlapi.com/ssl-certificate-api/api/analyze?domain=${target}&apiKey=${API_KEY}&outputFormat=json`
          );
        } catch {
          data = await fetchJSON(
            `https://ssl-certificate.whoisxmlapi.com/api/v4/?domain=${target}&apiKey=${API_KEY}&outputFormat=json`
          );
        }
        break;
      }
      case "reputation": {
        // Try with different parameter names
        try {
          data = await fetchJSON(
            `https://www.whoisxmlapi.com/domainReputationApi/api/v2?domainName=${target}&apiKey=${API_KEY}&outputFormat=json`
          );
        } catch {
          data = await fetchJSON(
            `https://domain-reputation.whoisxmlapi.com/api/v2/?domainName=${target}&apiKey=${API_KEY}&outputFormat=json`
          );
        }
        break;
      }
      case "categorization": {
        data = await fetchJSON(
          `https://www.whoisxmlapi.com/websiteCategorizationApi/api/v3/?url=${target}&apiKey=${API_KEY}&outputFormat=json`
        );
        break;
      }
      case "availability": {
        data = await fetchJSON(
          `https://www.whoisxmlapi.com/domain-availability-api/api/?domainName=${target}&apiKey=${API_KEY}&outputFormat=json`
        );
        break;
      }
      case "threat": {
        data = await fetchJSON(
          `https://www.whoisxmlapi.com/threat-intelligence-api/api/v2/?ip=${target}&apiKey=${API_KEY}&outputFormat=json`
        );
        break;
      }
      case "vpn": {
        data = await fetchJSON(
          `https://vpn-detection.whoisxmlapi.com/api/?apiKey=${API_KEY}&ip=${target}&outputFormat=json`
        );
        break;
      }
      case "netblocks": {
        data = await fetchJSON(
          `https://ipnetblocks.whoisxmlapi.com/api/?apiKey=${API_KEY}&ip=${target}&outputFormat=json`
        );
        break;
      }
      case "email": {
        data = await fetchJSON(
          `https://emailverification.whoisxmlapi.com/api/v3/?apiKey=${API_KEY}&email=${target}&outputFormat=json`
        );
        break;
      }
      case "research": {
        data = await fetchJSON(
          `https://api.domainsrsapi.com/v2/?apiKey=${API_KEY}&domain=${target}&type=live&outputFormat=json`
        );
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
