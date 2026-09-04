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
    await supabase.from("targets").update({ domain: notes }).eq("id", target.id);
    setLoading(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-dim">Notes and documentation</p>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[11px] text-emerald-400">Saved</span>}
          <button onClick={handleSave} disabled={loading} className="rounded-md bg-gradient-to-r from-accent to-fuchsia px-4 py-1.5 text-xs font-semibold text-white transition-all hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] disabled:opacity-50">
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes, methodology, observations..."
        rows={18}
        className="rounded-xl border border-white/5 bg-surface px-4 py-3 font-mono text-xs leading-relaxed outline-none transition-all focus:border-accent/20 focus:shadow-[0_0_0_1px_rgba(168,85,247,0.08)]"
      />
      <p className="text-[10px] text-muted-dim/50">
        Document your methodology, tools used, and key observations. Shared between all team members.
      </p>
    </div>
  );
}
