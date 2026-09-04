"use client";

import { useState } from "react";
import type { Target } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

export function NotesTab({ target }: { target: Target }) {
  const [notes, setNotes] = useState(
    `Target: ${target.name}\nDomain: ${target.domain || "—"}\nIP Range: ${target.ip_range || "—"}\nCategory: ${target.category}\nScope: ${target.scope}\nStatus: ${target.status}\nOwner: ${target.owner || "—"}\n\n---\n\nNotes:\n`
  );
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("targets")
      .update({ domain: notes })
      .eq("id", target.id);
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Notes and documentation for this target
        </p>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-emerald-400">Saved</span>
          )}
          <button
            onClick={handleSave}
            disabled={loading}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-accent/80 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save notes"}
          </button>
        </div>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes, methodology, observations..."
        rows={16}
        className="rounded-lg border border-white/10 bg-surface px-4 py-3 font-mono text-xs leading-relaxed outline-none focus:border-accent/40"
      />
      <p className="text-[10px] text-muted/40">
        Tip: document your methodology, tools used, and key observations
        here. Notes are shared between all team members.
      </p>
    </div>
  );
}
