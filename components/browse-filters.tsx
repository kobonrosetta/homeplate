"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "bread", label: "Bread" },
  { value: "pastry", label: "Pastry" },
  { value: "dessert", label: "Dessert" },
  { value: "meal", label: "Meal" },
  { value: "preserves", label: "Preserves" },
  { value: "beverage", label: "Beverage" },
  { value: "other", label: "Other" },
];

export default function BrowseFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get("q") ?? "";
  const cat = params.get("cat") ?? "";
  const sort = params.get("sort") ?? "newest";

  function update(next: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`${pathname}?${p.toString()}`);
  }

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("q") ?? "");
    update({ q: value });
  }

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={onSearch}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search bread, tamales, a kitchen name…"
          className="w-full rounded-full border border-line bg-card px-5 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line"
        />
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value || "all"}
            onClick={() => update({ cat: c.value })}
            className={
              cat === c.value
                ? "rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:text-ink"
            }
          >
            {c.label}
          </button>
        ))}

        <select
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
          className="ml-auto rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink outline-none"
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
      </div>
    </div>
  );
}
