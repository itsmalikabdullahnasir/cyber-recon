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

// PATCH /api/pipelines/:id -> update name / description / modules.
// (Next 16 passes route params as a Promise, hence `await params`.)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.description === "string") patch.description = body.description;
  if (Array.isArray(body.modules)) patch.modules = body.modules;

  const { data, error } = await supabase
    .from("pipeline_profiles")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return databaseError(error);
  return NextResponse.json({ profile: data });
}

// DELETE /api/pipelines/:id -> remove a custom pipeline.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { error } = await supabase.from("pipeline_profiles").delete().eq("id", id);
  if (error) return databaseError(error);
  return NextResponse.json({ ok: true });
}
