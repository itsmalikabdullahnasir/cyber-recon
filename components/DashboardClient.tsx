"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Target, Host } from "@/lib/types";
import { LIKELIHOOD_ORDER } from "@/lib/types";
import { SearchBar } from "@/components/SearchBar";
import { FilterChips } from "@/components/FilterChips";
import { TargetCard } from "@/components/TargetCard";
import { EmptyState } from "@/components/EmptyState";

export function DashboardClient({
  targets,
  hosts,
  categories,
}: {
  targets: Target[];
  hosts: Host[];
  categories: string[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const hostsByTarget = useMemo(() => {
    const map = new Map<string, Host[]>();
    for (const h of hosts) {
      const list = map.get(h.target_id) ?? [];
      list.push(h);
      map.set(h.target_id, list);
    }
    return map;
  }, [hosts]);

  const filtered = useMemo(() => {
    let result = targets;

    if (filter === "High risk") {
      result = result.filter((t) => {
        const tHosts = hostsByTarget.get(t.id) ?? [];
        return tHosts.some(
          (h) => h.exploitability === "High" || h.exploitability === "Critical"
        );
      });
    } else if (filter !== "All") {
      result = result.filter((t) => t.category === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => {
        if (t.name.toLowerCase().includes(q)) return true;
        const tHosts = hostsByTarget.get(t.id) ?? [];
        if (tHosts.some((h) => h.ip.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    return result;
  }, [targets, filter, search, hostsByTarget]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar value={search} onChange={setSearch} />
        <FilterChips
          categories={categories}
          active={filter}
          onSelect={setFilter}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message="No targets found. Add your first target to get started."
          actionLabel="Add target"
          actionHref="/targets/new"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TargetCard
              key={t.id}
              target={t}
              hosts={hostsByTarget.get(t.id) ?? []}
            />
          ))}
        </div>
      )}

      <Link
        href="/targets/new"
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-2xl font-bold text-black shadow-lg transition-colors hover:bg-accent/80"
      >
        +
      </Link>
    </div>
  );
}
