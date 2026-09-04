import { NextResponse } from "next/server";

const API_KEY = "at_KrGgtnDLCPkm2uhg7niUNY2iCv9Sk";
const BASE = "https://www.whoisxmlapi.com";

async function get(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}apiKey=${API_KEY}&outputFormat=json`);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  return res.json();
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
        data = await get(`/whoisserver/WhoisService?domainName=${target}`);
        break;
      }
      case "dns": {
        data = await get(`/dnsapi/info/${target}`);
        break;
      }
      case "geo": {
        data = await get(`/ip-geolocation-api/json/${target}`);
        break;
      }
      case "screenshot": {
        const sRes = await fetch(`https://screenshotapi.net/api/v1/screenshot?token=${API_KEY}&url=${target}&full_page=false&output=json&file_format=json&wait_for_event=load`);
        data = await sRes.json();
        break;
      }
      case "ssl": {
        data = await get(`/ssl-certificate-api/api/v4/?domain=${target}`);
        break;
      }
      case "reputation": {
        data = await get(`/domain-reputation-api/api/v2/?domainName=${target}`);
        break;
      }
      case "categorization": {
        data = await get(`/website-categorization-api/api/v3/?url=${target}`);
        break;
      }
      case "availability": {
        data = await get(`/domain-availability-api/api/?domainName=${target}`);
        break;
      }
      case "threat": {
        data = await get(`/threat-intelligence-api/api/v2/?ip=${target}`);
        break;
      }
      case "vpn": {
        const vRes = await fetch(`https://vpn-detection.whoisxmlapi.com/api/?apiKey=${API_KEY}&ip=${target}&outputFormat=json`);
        data = await vRes.json();
        break;
      }
      case "netblocks": {
        const nRes = await fetch(`https://ipnetblocks.whoisxmlapi.com/api/?apiKey=${API_KEY}&ip=${target}&outputFormat=json`);
        data = await nRes.json();
        break;
      }
      case "email": {
        const eRes = await fetch(`https://emailverification.whoisxmlapi.com/api/v3/?apiKey=${API_KEY}&email=${target}`);
        data = await eRes.json();
        break;
      }
      case "research": {
        const rRes = await fetch(`https://api.domainsrsapi.com/v2/?apiKey=${API_KEY}&domain=${target}&type=live`);
        data = await rRes.json();
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
