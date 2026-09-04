"use client";

import { useState } from "react";
import type { Target } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

export function NotesTab({ target }: { target: Target }) {
  const [notes, setNotes] = useState(target.domain || "");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("targets")
      .update({ domain: notes || null })
      .eq("id", target.id);
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        General notes for this target
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes here..."
        rows={8}
        className="rounded-lg border border-white/10 bg-surface px-4 py-3 text-sm outline-none focus:border-accent/40"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={loading}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-accent/80 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save notes"}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
      </div>
    </div>
  );
}
