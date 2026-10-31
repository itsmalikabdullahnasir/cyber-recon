import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Node runtime: we call the worker over HTTPS with a server-only secret.
export const runtime = "nodejs";
export const maxDuration = 15;

// Serves the dynamic module registry to the browser.
//
// The registry lives on the worker (only the VM knows which tools are actually
// installed). The browser can't call the worker directly because that needs the
// shared secret, which must never reach client code — so this route proxies it
// behind the user's Supabase session. GET /api/modules -> worker GET /modules.
export async function GET() {
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

  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, "")}/modules`, {
      headers: { "X-Worker-Secret": workerSecret },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ error: "Worker error", detail: detail.slice(0, 200) }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    const message = e instanceof Error ? e.message : "unreachable";
    return NextResponse.json({ error: "Worker unreachable", detail: message }, { status: 502 });
  }
}
