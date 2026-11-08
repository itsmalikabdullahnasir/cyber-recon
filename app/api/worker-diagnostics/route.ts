import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function worker() {
  const url = process.env.RECON_WORKER_URL?.replace(/\/$/, "");
  const secret = process.env.RECON_WORKER_SECRET;
  if (!url || !secret) throw new Error("Worker is not configured");
  return { url, secret };
}

export async function GET(request: Request) {
  try {
    const { url, secret } = worker();
    const bundle = new URL(request.url).searchParams.get("bundle") === "1";
    const response = await fetch(`${url}/diagnostics${bundle ? "/bundle" : ""}`, {
      headers: { "X-Worker-Secret": secret }, cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return NextResponse.json({ error: `Worker returned ${response.status}` }, { status: 502 });
    if (!bundle) return NextResponse.json(await response.json());
    return new Response(await response.arrayBuffer(), { headers: {
      "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=recon-vm-diagnostics.zip",
    }});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Worker is unreachable" }, { status: 502 });
  }
}
