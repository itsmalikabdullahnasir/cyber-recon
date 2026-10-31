"use client";

import { useEffect, useRef } from "react";

// App-wide interactive dot-grid backdrop. Mounted once in the root layout,
// behind everything (z-index:-1, pointer-events:none — same technique as the
// existing .aurora). The dots are painted with a CSS radial-gradient pattern
// (zero DOM nodes, so it covers the whole viewport cheaply). A second "glow"
// layer is masked to a circle that follows the cursor, so dots light up as you
// move. Clicking anywhere sends a ripple out from the click point.
//
// Because it listens on `window` (not on the element), it reacts across the
// whole app even though content sits on top of it. Styling: .dotgrid* in
// globals.css.
export function DotGridBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let x = -999;
    let y = -999;

    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          el.style.setProperty("--mx", `${x}px`);
          el.style.setProperty("--my", `${y}px`);
          raf = 0;
        });
      }
    };

    const onClick = (e: MouseEvent) => {
      const ripple = document.createElement("span");
      ripple.className = "dotgrid__ripple";
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      el.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 900);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("click", onClick);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="dotgrid" aria-hidden>
      <div className="dotgrid__layer" />
      <div className="dotgrid__glow" />
    </div>
  );
}
