"use client";

import { useRef, useState, type KeyboardEvent } from "react";

// Shared, curated vocabulary all kitchens draw from — drives consistency (so
// browse can filter later) without locking cooks in: they can still type their
// own. Open list, not a closed set.
const SUGGESTIONS = [
  "Filipino", "Mexican", "Thai", "Indian", "Chinese", "Korean", "Japanese",
  "Vietnamese", "Italian", "Ethiopian", "Persian", "Salvadoran", "Caribbean",
  "Middle Eastern", "Soul food", "Sourdough", "Pastries", "Desserts", "Cakes",
  "Bread", "Cookies", "Jam & preserves", "Vegan", "Vegetarian", "Gluten-free",
  "Halal", "Dairy-free", "BBQ", "Tamales", "Empanadas", "Dumplings",
  "Meal prep", "Breakfast",
];

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr ?? []) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

// A chip/token input for a kitchen's cuisine tags. Each tag is a removable pill
// (add via Enter/comma/blur, remove via × or Backspace-on-empty); a filtered
// suggestion row sits below. Submits a hidden comma-joined `name` field, so the
// existing server actions (which split on ",") need no change.
export default function CuisineTagsField({
  defaultValue = [],
  name = "cuisine_tags",
  label,
  hint,
}: {
  defaultValue?: string[];
  name?: string;
  label?: string;
  hint?: string;
}) {
  const [tags, setTags] = useState<string[]>(dedupe(defaultValue));
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const has = (t: string) =>
    tags.some((x) => x.toLowerCase() === t.toLowerCase());

  const add = (raw: string) => {
    // Split on commas so a pasted "Hakka, Chinese" becomes two chips, not one
    // tag with an interior comma (which the hidden comma-joined field — and the
    // server's split(",") — would silently break apart anyway).
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setTags((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (p.length > 30) continue;
        if (next.some((x) => x.toLowerCase() === p.toLowerCase())) continue;
        next.push(p);
      }
      return next;
    });
    setInput("");
  };

  const remove = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
    } else if (e.key === "Backspace" && input === "" && tags.length) {
      remove(tags[tags.length - 1]);
    }
  };

  const suggestions = SUGGESTIONS.filter(
    (s) =>
      !has(s) &&
      (input.trim() === "" ||
        s.toLowerCase().includes(input.trim().toLowerCase()))
  ).slice(0, 8);

  return (
    <div>
      {label && (
        <span className="text-sm font-medium text-ink">{label}</span>
      )}
      <input type="hidden" name={name} value={tags.join(",")} />
      <div
        onClick={() => inputRef.current?.focus()}
        className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 focus-within:border-muted focus-within:ring-2 focus-within:ring-line"
      >
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-brand/10 py-1 pl-2.5 pr-1.5 text-sm font-medium text-brand"
          >
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              // preventDefault stops the input's blur-commit from firing first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => remove(t)}
              className="leading-none text-brand/60 hover:text-brand"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(input)}
          placeholder={tags.length ? "Add another…" : "Filipino, sourdough, vegan…"}
          className="min-w-[8rem] flex-1 border-0 bg-transparent p-0 text-ink outline-none placeholder:text-faint"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s)}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-muted hover:text-ink"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}
