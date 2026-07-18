// Turn a kitchen name into a URL-friendly slug, e.g. "Kate's Bread" -> "kates-bread".
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/['’`]/g, "") // drop apostrophes so "Kate's" -> "kates", not "kate-s"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || "kitchen";
}
