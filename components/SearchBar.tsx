"use client";

export function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      placeholder="Search targets, hosts, findings..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/10 bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent/40"
    />
  );
}
