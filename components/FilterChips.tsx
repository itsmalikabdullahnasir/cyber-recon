"use client";

export function FilterChips({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string;
  onSelect: (cat: string) => void;
}) {
  const all = ["All", ...categories, "High risk"];
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            active === cat
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-white/10 bg-transparent text-muted hover:text-foreground"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
