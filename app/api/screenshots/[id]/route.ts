import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = process.env.RECON_WORKER_URL?.replace(/\/$/, "");
  const secret = process.env.RECON_WORKER_SECRET;
  if (!url || !secret) return NextResponse.json({ error: "Worker is not configured" }, { status: 503 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid screenshot id" }, { status: 400 });
  try {
    const response = await fetch(`${url}/screenshots/${id}`, { headers: { "X-Worker-Secret": secret }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return NextResponse.json({ error: "Screenshot unavailable" }, { status: response.status === 404 ? 404 : 502 });
    return new Response(await response.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "Screenshot service is unreachable" }, { status: 502 });
  }
}
