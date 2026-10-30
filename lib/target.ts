// Shared target validation — mirrors the worker's app/validation.py.
// A value must be a domain name or a globally-routable IP before it is ever
// written to a scan row or sent to the worker.

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export type TargetKind = "domain" | "ip";

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||        // link-local incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 ||                         // multicast / reserved
    (a === 192 && b === 0) ||           // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1)
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||          // TEST-NET-2
    (a === 203 && b === 0)              // TEST-NET-3
  );
}

export function parseTarget(raw: string): { kind: TargetKind; value: string } | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!value || value.length > 253) return null;

  if (/^[0-9.]+$/.test(value)) {
    return isPrivateV4(value) ? null : { kind: "ip", value };
  }
  if (value.includes(":") && /^[0-9a-f:]+$/.test(value)) {
    // IPv6: block loopback, link-local (fe80), ULA (fc/fd) and unspecified.
    if (value === "::1" || value === "::" || /^fe80:/.test(value) || /^f[cd]/.test(value)) return null;
    return { kind: "ip", value };
  }

  const labels = value.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !TLD.test(labels[labels.length - 1])) {
    return null;
  }
  return { kind: "domain", value };
}
