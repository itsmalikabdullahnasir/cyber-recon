import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { OperationsClient } from "@/components/OperationsClient";
export default async function OperationsPage(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");return <><TopNav userEmail={user.email??""}/><main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6"><OperationsClient/></main></>}
