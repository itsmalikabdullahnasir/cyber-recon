"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Shared modal shell for the app's popup cards (host detail, scan detail, …).
// Extracted from the original Host-detail popup so every modal looks and
// behaves identically: click-outside / Esc to close, body scroll lock, and
// focus restored to whatever was focused before it opened. Keep ALL modal
// styling here — do not fork a second modal system.
export function Modal({
  onClose,
  ariaLabel,
  children,
}: {
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    prevFocus.current = (document.activeElement as HTMLElement) ?? null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prevFocus.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-in my-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-accent/20 bg-surface shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}
