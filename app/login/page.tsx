"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-surface/60 shadow-2xl shadow-black/40 backdrop-blur-xl md:grid-cols-2">
        {/* Left: brand hero */}
        <div className="relative hidden flex-col justify-between overflow-hidden p-8 md:flex">
          <div className="pointer-events-none absolute inset-0 grid-bg opacity-50" />
          <div className="relative">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-fuchsia text-2xl shadow-[0_0_30px_var(--color-accent-glow)]">
              🛡️
            </span>
            <h1 className="mt-5 text-2xl font-bold leading-tight">
              Cyber<span className="gradient-text">Recon</span>
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Your private pentest recon workspace. Subdomains, ports, tech-stack CVEs and active scans —
              orchestrated on your own VM, streamed back live.
            </p>
          </div>
          <div className="relative mt-8 flex flex-col gap-2">
            {["Automated recon pipeline", "Live scan telemetry", "Scope-gated active testing"].map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs text-muted">
                <span className="text-accent">◆</span> {f}
              </div>
            ))}
          </div>
        </div>

        {/* Right: form */}
        <div className="flex flex-col justify-center p-8">
          <div className="mb-6">
            <h2 className="text-lg font-bold tracking-tight">Sign in</h2>
            <p className="mt-1 text-xs text-muted-dim">Welcome back, operator.</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-dim">Email</label>
              <input
                type="email"
                placeholder="operator@recon.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="field"
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
                className="field"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs text-rose-400">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-accent mt-1">
              {loading ? "Authenticating…" : "Sign in →"}
            </button>
          </form>

          <p className="mt-6 text-center text-[10px] text-muted-dim/60">Authorized personnel only</p>
        </div>
      </div>
    </div>
  );
}
