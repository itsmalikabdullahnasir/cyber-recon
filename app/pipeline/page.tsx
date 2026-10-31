import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { PipelineBuilder } from "@/components/PipelineBuilder";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <TopNav userEmail={user.email ?? ""} />
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <span>🧩</span> Pipeline <span className="gradient-text">Builder</span>
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            Assemble a custom scanning pipeline from available modules, reorder and toggle stages, and save it as a
            reusable profile. Modules your VM doesn&apos;t have installed are shown but kept out of runs.
          </p>
        </div>
        <PipelineBuilder />
      </div>
    </>
  );
}
