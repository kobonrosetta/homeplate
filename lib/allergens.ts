// Single source of truth for dish-level allergen tags (Phase 1). The FDA
// "Big 9" major allergens plus the two most-requested extras (gluten as
// distinct from wheat for celiac buyers; nightshades). Structured — not free
// text — so the data is consistent, renders as chips, and can drive a
// buyer-side "hide anything with X" filter later (Phase 2). Extend by adding a
// row here; the form and display both read this list, so they stay in sync.
export const ALLERGENS: { key: string; label: string }[] = [
  { key: "milk", label: "Milk / dairy" },
  { key: "eggs", label: "Eggs" },
  { key: "fish", label: "Fish" },
  { key: "shellfish", label: "Shellfish" },
  { key: "tree_nuts", label: "Tree nuts" },
  { key: "peanuts", label: "Peanuts" },
  { key: "wheat", label: "Wheat" },
  { key: "soy", label: "Soy" },
  { key: "sesame", label: "Sesame" },
  { key: "gluten", label: "Gluten" },
  { key: "nightshades", label: "Nightshades" },
];

const BY_KEY = new Map(ALLERGENS.map((a) => [a.key, a.label]));

// Map a list of stored keys to display labels, silently dropping any unknown
// key (defends the UI against stale/injected values).
export function allergenLabels(keys: string[] | null | undefined): string[] {
  return (keys ?? []).filter((k) => BY_KEY.has(k)).map((k) => BY_KEY.get(k)!);
}

// Parse the allergen checkboxes from a submitted listing form. Keeps only known
// keys (so a forged POST can't inject arbitrary strings), dedupes, and drops
// any key that appears in BOTH lists from may_contain — an explicit "contains"
// always wins over "may contain". `declared` is the cook's affirmative
// confirmation that the allergen list is complete (or that there are none):
// its whole point is that a blank must never read as "allergen-free".
export function readAllergensFromForm(formData: FormData): {
  contains: string[];
  mayContain: string[];
  declared: boolean;
} {
  const clean = (vals: FormDataEntryValue[]) =>
    Array.from(new Set(vals.map(String).filter((v) => BY_KEY.has(v))));
  const contains = clean(formData.getAll("contains"));
  const mayContain = clean(formData.getAll("may_contain")).filter(
    (k) => !contains.includes(k)
  );
  const declared = String(formData.get("allergens_declared") ?? "") === "true";
  return { contains, mayContain, declared };
}

// Build the listing's allergen DB columns from parsed form values, applying the
// one rule both write paths share: allergens are food-only, so an extra always
// stores empty/undeclared. Kept here (not inline in each action) so the create
// and edit paths can't drift — the served_hot inconsistency this review caught
// was exactly that kind of copy-paste divergence.
export function allergenColumns(
  kind: "dish" | "extra",
  parsed: { contains: string[]; mayContain: string[]; declared: boolean }
): { contains: string[]; may_contain: string[]; allergens_declared: boolean } {
  const isDish = kind === "dish";
  return {
    contains: isDish ? parsed.contains : [],
    may_contain: isDish ? parsed.mayContain : [],
    allergens_declared: isDish ? parsed.declared : false,
  };
}
