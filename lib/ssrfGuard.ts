// Best-effort SSRF protection for server-side fetches of user-supplied URLs.
// Resolves the host and refuses private / loopback / link-local / CGNAT /
// cloud-metadata addresses, and re-validates every redirect hop. Node runtime
// only (uses node:dns / node:net), so routes that use this must export
// `runtime = "nodejs"`.

import dns from "node:dns/promises";
import net from "node:net";

export function isPrivateIp(ipRaw: string): boolean {
  let ip = ipRaw.trim().toLowerCase();
  // Unwrap IPv4-mapped IPv6 like ::ffff:127.0.0.1
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) ip = mapped[1];

  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true; // "this", 10/8, loopback
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a === 192 && b === 0) return true; // 192.0.0/24, 192.0.2/24
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    if (ip === "::1" || ip === "::") return true; // loopback / unspecified
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // ULA fc00::/7
    if (/^fe[89ab]/.test(ip)) return true; // link-local fe80::/10
    return false;
  }
  return true; // unknown format → refuse
}

// Resolve the URL's host and throw if it (or any resolved IP) is internal.
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  let ips: string[];
  if (net.isIP(host)) {
    ips = [host];
  } else {
    const records = await dns.lookup(host, { all: true }).catch(() => []);
    ips = records.map((r) => r.address);
  }
  if (!ips.length) throw new Error(`Could not resolve ${host}`);
  for (const ip of ips) {
    if (isPrivateIp(ip)) throw new Error(`Refused: ${host} resolves to a private/internal address`);
  }
  return u;
}

// Drop-in replacement for fetch() that validates the host and re-validates
// every redirect hop (so a 30x to an internal address is also blocked).
export async function safeFetch(raw: string, init: RequestInit = {}, maxRedirects = 4): Promise<Response> {
  let current = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = await assertPublicUrl(current);
    const res = await fetch(u, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, u).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
