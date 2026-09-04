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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

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
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-2xl shadow-[0_0_20px_rgba(0,229,160,0.15)]">
            🛡️
          </div>
          <h1 className="text-xl font-bold tracking-tight">Cyber Recon</h1>
          <p className="mt-1.5 text-xs text-muted-dim">
            Sign in to your recon workspace
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-dim">
              Email
            </label>
            <input
              type="email"
              placeholder="operator@recon.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-lg border border-white/5 bg-surface px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-accent/30 focus:bg-surface-hover focus:shadow-[0_0_0_1px_rgba(0,229,160,0.1)]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-dim">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-lg border border-white/5 bg-surface px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-accent/30 focus:bg-surface-hover focus:shadow-[0_0_0_1px_rgba(0,229,160,0.1)]"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-accent-dim hover:shadow-[0_0_20px_rgba(0,229,160,0.2)] disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] text-muted-dim/60">
          Authorized personnel only
        </p>
      </div>
    </div>
  );
}
