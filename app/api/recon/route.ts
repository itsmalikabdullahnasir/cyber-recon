import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseTarget } from "@/lib/target";

// Node runtime: we talk to the worker over HTTPS and need Node's fetch timeout.
export const runtime = "nodejs";
export const maxDuration = 20; // stay under Vercel's 25s wall; the scan itself runs on the VM

type Mode = "passive" | "full";

interface ScopeEntry {
  kind: "domain" | "wildcard" | "ip" | "cidr";
  value: string;
}

export async function POST(request: Request) {
  const workerUrl = process.env.RECON_WORKER_URL;
  const workerSecret = process.env.RECON_WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return NextResponse.json({ error: "Worker is not configured" }, { status: 503 });
  }

  // 1. Must be logged in (same Supabase session the rest of the app uses).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1b. Rate limiting: max 5 scans created per minute per user to protect worker capacity
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const { count: recentScanCount } = await supabase
    .from("scans")
    .select("id", { count: "exact", head: true })
    .eq("requested_by", user.id)
    .gte("created_at", oneMinuteAgo);

  if (recentScanCount !== null && recentScanCount >= 5) {
    return NextResponse.json(
      { error: "Rate limit exceeded: maximum 5 scans per minute per user. Please wait before queuing more scans." },
      { status: 429 }
    );
  }

  // 2. Parse and validate the request.
  let body: { target_id?: string; target?: string; mode?: Mode };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mode: Mode = body.mode === "full" ? "full" : "passive";
  if (!body.target_id || typeof body.target_id !== "string") {
    return NextResponse.json({ error: "target_id is required" }, { status: 400 });
  }

  // 3. Load the target (RLS still applies — the user can only read their own).
  const { data: target, error: targetErr } = await supabase
    .from("targets")
    .select("id, domain, scope")
    .eq("id", body.target_id)
    .single();
  if (targetErr || !target) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  // 4. Decide what to scan: explicit target wins, else the target's domain.
  const rawInput = (body.target || target.domain || "").trim();
  const parsed = parseTarget(rawInput);
  if (!parsed) {
    return NextResponse.json(
      { error: "Provide a valid domain or public IP (the target has none set)" },
      { status: 400 },
    );
  }

  // 5. SCOPE GATE for active scans. The worker enforces this again, but we
  //    refuse early so an out-of-scope "full" scan never even creates a row.
  if (mode === "full") {
    if (target.scope !== "In Scope") {
      return NextResponse.json(
        { error: "Active scan refused: target is not marked In Scope" },
        { status: 403 },
      );
    }
    const { data: scopeRows } = await supabase
      .from("scope_entries")
      .select("kind, value")
      .eq("target_id", target.id);
    const entries = (scopeRows ?? []) as ScopeEntry[];
    if (entries.length === 0) {
      return NextResponse.json(
        { error: "Active scan refused: add at least one authorized scope entry first" },
        { status: 403 },
      );
    }
    if (!inScope(parsed, entries)) {
      return NextResponse.json(
        { error: `Active scan refused: ${parsed.value} is not in this target's authorized scope` },
        { status: 403 },
      );
    }
  }

  // 6. Create the scan row as this user. requested_by defaults to auth.uid()
  //    via the column default + RLS insert policy.
  const { data: scan, error: scanErr } = await supabase
    .from("scans")
    .insert({
      target_id: target.id,
      input: parsed.value,
      mode,
      status: "queued",
      requested_by_email: user.email ?? null,
    })
    .select("id")
    .single();
  if (scanErr || !scan) {
    return NextResponse.json({ error: scanErr?.message ?? "Could not create scan" }, { status: 500 });
  }

  // Audit log scan creation
  void supabase.from("audit_logs").insert({
    actor_id: user.id,
    actor_email: user.email,
    action: "create_scan",
    target_id: target.id,
    metadata: { scan_id: scan.id, input: parsed.value, mode },
  });

  // 7. Hand off to the worker. It replies immediately and scans in the background.
  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, "")}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Worker-Secret": workerSecret },
      body: JSON.stringify({ target: parsed.value, scan_id: scan.id, mode }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      await supabase
        .from("scans")
        .update({ status: "failed", error: `Worker rejected: ${res.status} ${detail.slice(0, 200)}` })
        .eq("id", scan.id);
      return NextResponse.json({ error: "Worker rejected the scan", detail: detail.slice(0, 200) }, { status: 502 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "unreachable";
    await supabase.from("scans").update({ status: "failed", error: `Worker unreachable: ${message}` }).eq("id", scan.id);
    return NextResponse.json({ error: "Worker unreachable", detail: message }, { status: 502 });
  }

  return NextResponse.json({ status: "accepted", scan_id: scan.id, mode, input: parsed.value }, { status: 202 });
}

// Mirror of the worker's scope check, for the early gate only.
function inScope(parsed: { kind: "domain" | "ip"; value: string }, entries: ScopeEntry[]): boolean {
  if (parsed.kind === "domain") {
    return entries.some((e) => {
      if (e.kind === "domain") return e.value.toLowerCase() === parsed.value;
      if (e.kind === "wildcard") {
        const base = e.value.toLowerCase().replace(/^\*\./, "");
        return parsed.value.endsWith("." + base);
      }
      return false;
    });
  }
  return entries.some((e) => {
    if (e.kind === "ip") return e.value.trim() === parsed.value;
    if (e.kind === "cidr") return ipInCidr(parsed.value, e.value.trim());
    return false;
  });
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  if (ip.includes(":") || range.includes(":")) return false; // IPv4 only in the early gate
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const toInt = (a: string) =>
    a.split(".").reduce((acc, oct) => (acc << 8) + (Number(oct) & 255), 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(range) & mask);
}
