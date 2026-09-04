"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Scope, TargetStatus } from "@/lib/types";
import Link from "next/link";

export default function NewTargetPage() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("University");
  const [domain, setDomain] = useState("");
  const [ipRange, setIpRange] = useState("");
  const [scope, setScope] = useState<Scope>("In Scope");
  const [status, setStatus] = useState<TargetStatus>("Not Started");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { error } = await supabase.from("targets").insert({
      name: name.trim(),
      category,
      domain: domain.trim() || null,
      ip_range: ipRange.trim() || null,
      scope,
      status,
      owner: owner.trim() || null,
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
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/" className="text-xs text-muted hover:text-foreground">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">
          New target
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bahria University"
            className="rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/40"
          >
            <option>University</option>
            <option>Corp</option>
            <option>Government</option>
            <option>CTF</option>
            <option>Other</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">Domain</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. example.edu"
            className="rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">IP range</label>
          <input
            type="text"
            value={ipRange}
            onChange={(e) => setIpRange(e.target.value)}
            placeholder="e.g. 192.0.2.0/24"
            className="rounded-lg border border-white/10 bg-surface px-4 py-2.5 font-mono text-sm outline-none focus:border-accent/40"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/40"
            >
              <option>In Scope</option>
              <option>Out of Scope</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TargetStatus)}
              className="rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/40"
            >
              <option>Not Started</option>
              <option>Recon</option>
              <option>Testing</option>
              <option>Reporting</option>
              <option>Done</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">Owner</label>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="e.g. You"
            className="rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/40"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create target"}
        </button>
      </form>
    </div>
  );
}
