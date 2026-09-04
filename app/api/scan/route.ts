import { NextResponse } from "next/server";

const WAF_SIGNATURES: Record<string, string[]> = {
  "Cloudflare": ["cf-ray", "cf-cache-status", "cloudflare"],
  "AWS WAF": ["x-amzn-requestid", "x-amz-cf-id", "aws"],
  "Akamai": ["x-akamai", "akamai"],
  "Sucuri": ["x-sucuri-id", "sucuri"],
  "Wordfence": ["wordfence", "wf-cb-type"],
  "ModSecurity": ["mod_security", "modsecurity"],
  "Imperva": ["x-iinfo", "imperva"],
  "Barracuda": ["barra_counter_session", "barracuda"],
  "FortiWeb": ["fortiweb", "fwb"],
  "F5 BIG-IP": ["bigip", "f5"],
  "Radware": ["radware", "rdwr"],
  "NetScaler": ["netscaler", "citrix"],
};

function checkSecurityHeaders(headers: Record<string, string>) {
  const checks = [
    { name: "Strict-Transport-Security", good: !!headers["strict-transport-security"], desc: "HSTS enabled" },
    { name: "X-Content-Type-Options", good: headers["x-content-type-options"] === "nosniff", desc: "MIME sniffing prevented" },
    { name: "X-Frame-Options", good: !!headers["x-frame-options"], desc: "Clickjacking protection" },
    { name: "X-XSS-Protection", good: !!headers["x-xss-protection"], desc: "XSS filter enabled" },
    { name: "Content-Security-Policy", good: !!headers["content-security-policy"], desc: "CSP enabled" },
    { name: "Referrer-Policy", good: !!headers["referrer-policy"], desc: "Referrer policy set" },
    { name: "Permissions-Policy", good: !!headers["permissions-policy"] || !!headers["feature-policy"], desc: "Permissions policy set" },
    { name: "X-Permitted-Cross-Domain", good: !!headers["x-permitted-cross-domain-policies"], desc: "Cross-domain policy set" },
  ];
  return checks;
}

function checkCORS(headers: Record<string, string>, origin: string) {
  const acao = headers["access-control-allow-origin"];
  const acac = headers["access-control-allow-credentials"];
  const issues: string[] = [];

  if (!acao) return { status: "none", issues: ["No CORS headers found"], acao: null, acac: null };

  if (acao === "*") {
    issues.push("Wildcard origin allowed (*)");
    if (acac === "true") issues.push("CRITICAL: Credentials allowed with wildcard origin");
  }

  if (acao !== "*" && acao !== origin) {
    // Reflected origin - potential issue
    if (acao === origin) issues.push("Origin reflected (potential open redirect)");
  }

  if (acac === "true" && acao === "*") {
    issues.push("High risk: Credentials + wildcard = data theft risk");
  }

  return {
    status: issues.length > 0 ? "vulnerable" : "safe",
    issues,
    acao,
    acac,
  };
}

function detectWAF(headers: Record<string, string>, body: string) {
  const detected: { name: string; confidence: string }[] = [];

  for (const [waf, signatures] of Object.entries(WAF_SIGNATURES)) {
    for (const sig of signatures) {
      const headerStr = JSON.stringify(headers).toLowerCase();
      const bodyStr = body.toLowerCase();
      if (headerStr.includes(sig.toLowerCase()) || bodyStr.includes(sig.toLowerCase())) {
        detected.push({ name: waf, confidence: "high" });
        break;
      }
    }
  }

  // Check for block pages
  if (body.includes("access denied") || body.includes("blocked") || body.includes("security challenge")) {
    detected.push({ name: "Unknown WAF (block page detected)", confidence: "medium" });
  }

  return detected;
}

function analyzeCookies(setCookieHeaders: string[]) {
  return setCookieHeaders.map((cookie) => {
    const parts = cookie.split(";").map((p) => p.trim());
    const [nameValue] = parts;
    const name = nameValue?.split("=")[0];
    const flags = parts.slice(1).map((f) => f.toLowerCase());

    return {
      name,
      secure: flags.includes("secure"),
      httponly: flags.includes("httponly"),
      samesite: flags.find((f) => f.startsWith("samesite="))?.split("=")[1] || "none",
      issues: [
        !flags.includes("secure") ? "Missing Secure flag" : null,
        !flags.includes("httponly") ? "Missing HttpOnly flag" : null,
        !flags.some((f) => f.startsWith("samesite")) ? "Missing SameSite attribute" : null,
      ].filter(Boolean),
    };
  });
}

export async function POST(request: Request) {
  try {
    const { url, test } = await request.json();
    if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

    const target = url.startsWith("http") ? url : `https://${url}`;

    // Fetch the target
    const res = await fetch(target, {
      method: "GET",
      headers: { "User-Agent": "CyberRecon-Scanner/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
    const body = await res.text().catch(() => "");

    const results: any = {};

    if (!test || test === "headers") {
      results.headers = checkSecurityHeaders(headers);
    }

    if (!test || test === "cors") {
      const origin = new URL(target).origin;
      results.cors = checkCORS(headers, origin);
    }

    if (!test || test === "waf") {
      results.waf = detectWAF(headers, body);
    }

    if (!test || test === "cookies") {
      const setCookie = res.headers.getSetCookie?.() || [];
      results.cookies = analyzeCookies(setCookie);
    }

    if (!test || test === "methods") {
      // Test allowed methods via OPTIONS
      try {
        const optRes = await fetch(target, {
          method: "OPTIONS",
          headers: { "User-Agent": "CyberRecon-Scanner/1.0" },
          signal: AbortSignal.timeout(5000),
        });
        const allow = optRes.headers.get("allow") || "";
        results.methods = {
          allowed: allow.split(",").map((m) => m.trim()).filter(Boolean),
          hasPut: allow.includes("PUT"),
          hasDelete: allow.includes("DELETE"),
          hasPatch: allow.includes("PATCH"),
        };
      } catch {
        results.methods = { allowed: [], hasPut: false, hasDelete: false, hasPatch: false, error: "OPTIONS request failed" };
      }
    }

    if (!test || test === "tls") {
      const tls: any = {};
      if (headers["strict-transport-security"]) {
        const hsts = headers["strict-transport-security"];
        tls.hsts = true;
        tls.maxAge = hsts.match(/max-age=(\d+)/)?.[1] || null;
        tls.includeSubDomains = hsts.includes("includeSubDomains");
        tls.preload = hsts.includes("preload");
      } else {
        tls.hsts = false;
      }
      tls.protocol = res.headers.get("server") || null;
      results.tls = tls;
    }

    results.status = res.status;
    results.url = target;

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Scan failed" }, { status: 500 });
  }
}
