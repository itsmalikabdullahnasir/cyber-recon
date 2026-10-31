import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const workerUrl = process.env.RECON_WORKER_URL;
  if (!workerUrl) return NextResponse.json({ ok: false, error: "Worker is not configured" }, { status: 503 });
  const started = Date.now();
  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ ok: false, error: `Worker returned ${response.status}` }, { status: 502 });
    return NextResponse.json({ ok: body.ok === true, pending: body.pending ?? null, latencyMs: Date.now() - started });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Worker is unreachable", latencyMs: Date.now() - started },
      { status: 502 },
    );
  }
}
