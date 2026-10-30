import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseTarget } from "@/lib/target";

export const runtime = "nodejs";
export const maxDuration = 25;

type Mode = "passive" | "full";
const MAX_BULK = 50;

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { targets?: unknown; mode?: Mode; group_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mode: Mode = body.mode === "full" ? "full" : "passive";

  // Accept: ["a","b"] or [{target,mode}] or a single string.
  const rawList = normalizeTargets(body.targets);
  if (rawList.length === 0) {
    return NextResponse.json({ error: "No targets provided" }, { status: 400 });
  }
  if (rawList.length > MAX_BULK) {
    return NextResponse.json({ error: `Too many targets (max ${MAX_BULK})` }, { status: 400 });
  }

  // Scan into the chosen engagement group, or fall back to the console bucket.
  let consoleTargetId: string | null = null;
  if (body.group_id) {
    const { data: grp } = await supabase.from("targets").select("id").eq("id", body.group_id).maybeSingle();
    consoleTargetId = grp?.id ?? null;
    if (!consoleTargetId) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
  } else {
    consoleTargetId = await ensureConsoleTarget(supabase);
  }
  if (!consoleTargetId) {
    return NextResponse.json({ error: "Could not resolve the target group" }, { status: 500 });
  }

  // Allowlist (scope_entries of the destination group) — only needed for active scans.
  let entries: ScopeEntry[] = [];
  if (rawList.some((r) => (r.mode ?? mode) === "full")) {
    const { data } = await supabase
      .from("scope_entries")
      .select("kind, value")
      .eq("target_id", consoleTargetId);
    entries = (data ?? []) as ScopeEntry[];
  }

  const results: { target: string; status: string; scan_id?: string; error?: string }[] = [];

  for (const item of rawList) {
    const itemMode: Mode = item.mode ?? mode;
    const parsed = parseTarget(item.target);
    if (!parsed) {
      results.push({ target: item.target, status: "invalid", error: "not a valid domain or public IP" });
      continue;
    }
    if (itemMode === "full" && !inScope(parsed, entries)) {
      results.push({
        target: parsed.value,
        status: "refused",
        error: "not on the active-scan allowlist",
      });
      continue;
    }

    const { data: scan, error: scanErr } = await supabase
      .from("scans")
      .insert({
        target_id: consoleTargetId,
        input: parsed.value,
        mode: itemMode,
        status: "queued",
        requested_by_email: user.email ?? null,
      })
      .select("id")
      .single();
    if (scanErr || !scan) {
      results.push({ target: parsed.value, status: "error", error: scanErr?.message ?? "insert failed" });
      continue;
    }

    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Worker-Secret": workerSecret },
        body: JSON.stringify({ target: parsed.value, scan_id: scan.id, mode: itemMode }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        await supabase.from("scans").update({ status: "failed", error: `Worker: ${res.status} ${detail}` }).eq("id", scan.id);
        results.push({ target: parsed.value, status: "worker_error", scan_id: scan.id, error: detail });
      } else {
        results.push({ target: parsed.value, status: "accepted", scan_id: scan.id });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "unreachable";
      await supabase.from("scans").update({ status: "failed", error: `Worker unreachable: ${message}` }).eq("id", scan.id);
      results.push({ target: parsed.value, status: "worker_unreachable", scan_id: scan.id, error: message });
    }
  }

  const accepted = results.filter((r) => r.status === "accepted").length;
  return NextResponse.json({ accepted, total: rawList.length, results }, { status: accepted > 0 ? 202 : 400 });
}

function normalizeTargets(raw: unknown): { target: string; mode?: Mode }[] {
  const out: { target: string; mode?: Mode }[] = [];
  const push = (t: unknown, m?: unknown) => {
    if (typeof t === "string" && t.trim()) {
      out.push({ target: t.trim(), mode: m === "full" ? "full" : m === "passive" ? "passive" : undefined });
    }
  };
  if (typeof raw === "string") push(raw);
  else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        push(o.target ?? o.domain ?? o.ip ?? o.host, o.mode);
      }
    }
  }
  // Dedupe by target, keeping the first (active beats passive if both given).
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.target) ? false : seen.add(r.target)));
}

async function ensureConsoleTarget(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("targets")
    .select("id")
    .eq("is_console", true)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("targets")
    .insert({
      name: "Scan Console",
      category: "Console",
      scope: "In Scope",
      status: "Recon",
      is_console: true,
      description: "Ad-hoc scans launched from the Scan Console. Scope entries here are the active-scan allowlist.",
    })
    .select("id")
    .single();
  if (created?.id) return created.id;

  // Lost a race against a concurrent create — re-read.
  if (error) {
    const { data: again } = await supabase.from("targets").select("id").eq("is_console", true).maybeSingle();
    return again?.id ?? null;
  }
  return null;
}

function inScope(parsed: { kind: "domain" | "ip"; value: string }, entries: ScopeEntry[]): boolean {
  if (parsed.kind === "domain") {
    return entries.some((e) => {
      if (e.kind === "domain") return e.value.toLowerCase() === parsed.value;
      if (e.kind === "wildcard") return parsed.value.endsWith("." + e.value.toLowerCase().replace(/^\*\./, ""));
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
  if (ip.includes(":") || range.includes(":")) return false;
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const toInt = (a: string) => a.split(".").reduce((acc, oct) => (acc << 8) + (Number(oct) & 255), 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(range) & mask);
}
