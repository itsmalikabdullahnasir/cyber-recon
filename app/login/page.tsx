"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-fuchsia/20 text-3xl shadow-[0_0_30px_rgba(168,85,247,0.2)]">
            🛡️
          </div>
          <h1 className="text-xl font-bold tracking-tight">Cyber Recon</h1>
          <p className="mt-1.5 text-xs text-muted-dim">Sign in to your recon workspace</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Email</label>
            <input
              type="email"
              placeholder="operator@recon.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-lg border border-white/5 bg-surface px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-accent/30 focus:bg-surface-hover focus:shadow-[0_0_0_1px_rgba(168,85,247,0.1)]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-lg border border-white/5 bg-surface px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-accent/30 focus:bg-surface-hover focus:shadow-[0_0_0_1px_rgba(168,85,247,0.1)]"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-gradient-to-r from-accent to-fuchsia px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:shadow-[0_0_24px_rgba(168,85,247,0.3)] disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] text-muted-dim/50">Authorized personnel only</p>
      </div>
    </div>
  );
}
