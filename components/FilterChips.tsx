"use client";

export function FilterChips({
  categories,
  active,
  onSelect,
}: {
  categories: { cat: string; count: number }[];
  active: string;
  onSelect: (cat: string) => void;
}) {
  const allCats = [
    { cat: "All", count: categories.reduce((s, c) => s + c.count, 0) },
    ...categories,
    { cat: "High risk", count: 0 },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {allCats.map(({ cat, count }) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
            active === cat
              ? "border-accent/30 bg-accent/10 text-accent shadow-[0_0_12px_rgba(168,85,247,0.15)]"
              : "border-white/5 bg-surface text-muted hover:border-white/10 hover:text-foreground"
          }`}
        >
          {cat}
          {count > 0 && cat !== "All" && (
            <span className={`rounded-full px-1 py-0.5 text-[9px] leading-none ${active === cat ? "bg-accent/20 text-accent" : "bg-white/5 text-muted-dim"}`}>
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
