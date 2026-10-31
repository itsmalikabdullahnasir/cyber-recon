"use client";

import { useRef, useState } from "react";

// A "unique" button: on hover the label scrambles through random glyphs and
// resolves back, with a light sweep passing through it. Pure React + CSS — no
// motion/react or react-icons dependency. Styling lives in globals.css
// (.encrypt-btn*). Drop it in anywhere a primary action wants some character:
//   <EncryptButton text="Run scan" onClick={go} />
const CYCLES_PER_LETTER = 2;
const SHUFFLE_TIME = 50;
const CHARS = "!@#$%^&*():{};|,.<>/?";

export function EncryptButton({
  text,
  onClick,
  type = "button",
  disabled = false,
  className = "",
}: {
  text: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [display, setDisplay] = useState(text);

  const scramble = () => {
    let pos = 0;
    stop();
    intervalRef.current = setInterval(() => {
      const scrambled = text
        .split("")
        .map((char, i) => (pos / CYCLES_PER_LETTER > i ? char : CHARS[Math.floor(Math.random() * CHARS.length)]))
        .join("");
      setDisplay(scrambled);
      pos++;
      if (pos >= text.length * CYCLES_PER_LETTER) stop();
    }, SHUFFLE_TIME);
  };

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setDisplay(text);
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={scramble}
      onMouseLeave={stop}
      className={`encrypt-btn ${className}`}
    >
      <span className="encrypt-btn__label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>{display}</span>
      </span>
      <span className="encrypt-btn__sweep" aria-hidden />
    </button>
  );
}
