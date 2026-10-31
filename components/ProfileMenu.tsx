"use client";

import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signOut } from "@/app/actions";

// The nav user pill — click to open a profile card with a big animated
// blobatar, the signed-in user, a theme toggle and sign-out.
export function ProfileMenu({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = (userEmail || "user").split("@")[0];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Profile"
        className="flex items-center gap-2 rounded-lg border border-white/5 bg-surface px-2 py-1.5 transition-colors hover:border-white/15"
      >
        <UserAvatar name={userEmail || "user"} size={20} animated />
        <span className="hidden max-w-[150px] truncate text-xs text-muted sm:block">{userEmail}</span>
        <svg
          className={`h-3 w-3 text-muted-dim transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="animate-fade-in absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl">
          <div className="relative flex flex-col items-center gap-2 p-5">
            <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
            <div className="relative">
              <UserAvatar name={userEmail || "user"} size={64} animated />
            </div>
            <div className="relative text-center">
              <p className="text-sm font-semibold capitalize">{name}</p>
              <p className="max-w-[200px] truncate text-[11px] text-muted-dim">{userEmail}</p>
            </div>
            <span className="relative flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 text-emerald-400" /> Online
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-white/5 px-4 py-2.5">
            <span className="text-xs text-muted">Theme</span>
            <ThemeToggle />
          </div>

          <form action={signOut} className="border-t border-white/5">
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-rose-300 transition-colors hover:bg-rose-500/10"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
