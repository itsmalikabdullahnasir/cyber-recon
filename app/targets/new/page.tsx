"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Scope, TargetStatus, Priority } from "@/lib/types";
import {
  CATEGORY_ICONS,
  METHODOLOGY_PRESETS,
} from "@/lib/types";
import Link from "next/link";

const CATEGORIES = Object.keys(CATEGORY_ICONS);

export default function NewTargetPage() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("University");
  const [domain, setDomain] = useState("");
  const [ipRange, setIpRange] = useState("");
  const [scope, setScope] = useState<Scope>("In Scope");
  const [status, setStatus] = useState<TargetStatus>("Not Started");
  const [owner, setOwner] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("None");
  const [methodology, setMethodology] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Target name is required");
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
      description: description.trim() || null,
      priority,
      methodology: methodology || null,
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight">New target</h1>
        <p className="mt-1 text-xs text-muted">
          Add a new system to your recon workspace
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Category selection */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted">Category</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                  category === cat
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-white/6 bg-surface text-muted hover:border-white/12 hover:text-foreground"
                }`}
              >
                <span>{CATEGORY_ICONS[cat]}</span>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Basic info */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bahria University"
              autoFocus
              className="rounded-lg border border-white/6 bg-surface px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent/30 focus:bg-surface-hover"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. bahria.edu.pk"
              className="rounded-lg border border-white/6 bg-surface px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent/30 focus:bg-surface-hover"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">IP range</label>
          <input
            type="text"
            value={ipRange}
            onChange={(e) => setIpRange(e.target.value)}
            placeholder="e.g. 192.0.2.0/24, 10.0.0.1-10.0.0.254"
            className="rounded-lg border border-white/6 bg-surface px-4 py-2.5 font-mono text-sm outline-none transition-colors focus:border-accent/30 focus:bg-surface-hover"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">
            Description / Scope notes
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is the scope of this engagement? What's in bounds?"
            rows={3}
            className="rounded-lg border border-white/6 bg-surface px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent/30 focus:bg-surface-hover"
          />
        </div>

        {/* Status and scope */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="rounded-lg border border-white/6 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/30"
            >
              <option>In Scope</option>
              <option>Out of Scope</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TargetStatus)}
              className="rounded-lg border border-white/6 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/30"
            >
              <option>Not Started</option>
              <option>Recon</option>
              <option>Scanning</option>
              <option>Enumeration</option>
              <option>Exploitation</option>
              <option>Post-Exploitation</option>
              <option>Reporting</option>
              <option>Done</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="rounded-lg border border-white/6 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/30"
            >
              <option>None</option>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </div>
        </div>

        {/* Methodology */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">
            Methodology / Framework
          </label>
          <select
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
            className="rounded-lg border border-white/6 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/30"
          >
            <option value="">Select methodology...</option>
            {METHODOLOGY_PRESETS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Owner</label>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="e.g. You"
            className="rounded-lg border border-white/6 bg-surface px-4 py-2.5 text-sm outline-none transition-colors focus:border-accent/30 focus:bg-surface-hover"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-black transition-colors hover:bg-accent-dim disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create target"}
          </button>
          <Link
            href="/"
            className="rounded-lg border border-white/6 px-6 py-2.5 text-sm text-muted transition-colors hover:border-white/12 hover:text-foreground"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
