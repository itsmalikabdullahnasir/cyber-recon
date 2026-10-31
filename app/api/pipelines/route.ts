import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function databaseError(error: { code?: string; message?: string }) {
  if (error.code === "42P01" || error.code === "PGRST205" || error.message?.includes("pipeline_profiles")) {
    return NextResponse.json(
      { error: "Pipeline storage is not initialized. Apply supabase/migrations/20261031000200_pipelines.sql in Supabase SQL Editor." },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: error.message ?? "Database request failed" }, { status: 500 });
}

// GET /api/pipelines -> list the user's saved custom pipelines.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("pipeline_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return databaseError(error);
  return NextResponse.json({ profiles: data ?? [] });
}

// POST /api/pipelines -> create a new custom pipeline.
// Body: { name, description?, modules: [{ id, enabled, config? }] }
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { name?: string; description?: string; modules?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const modules = Array.isArray(body.modules) ? body.modules : [];

  const { data, error } = await supabase
    .from("pipeline_profiles")
    .insert({ name, description: body.description ?? null, modules })
    .select("*")
    .single();
  if (error) return databaseError(error);
  return NextResponse.json({ profile: data }, { status: 201 });
}
