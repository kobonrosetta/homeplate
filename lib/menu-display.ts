// Display-layer helpers for a kitchen's menu page. Pure string functions —
// they never touch the data, only how it reads on screen — and unit-tested
// next to the fee math.
//
// Both lean on a naming convention 40 Acres already uses consistently
// ("BUFFET-STYLE: …", "FAMILY-STYLE: …", "(FEEDS 18-20)"), but degrade
// gracefully for kitchens that don't: no prefix match → everything lands in
// the catch-all section (and the page renders flat, unsectioned), no feeds
// parenthetical → title passes through untouched.

export type MenuSection = { id: string; title: string };

export const MENU_SECTIONS: MenuSection[] = [
  { id: "trays", title: "Buffet Trays" },
  { id: "family-dinners", title: "Family Dinners" },
  { id: "plates-sides", title: "Plates, Bowls & Sides" },
];

// Which section a dish belongs to, from its title alone.
export function menuSectionFor(title: string): string {
  const t = (title ?? "").toUpperCase();
  if (/\bBUFFET\b/.test(t)) return "trays";
  if (/^\s*FAMILY[\s-]*STYLE/.test(t) || /\bFAMILY (DINNER|MEAL)\b/.test(t)) {
    return "family-dinners";
  }
  return "plates-sides";
}

// Pull a "(FEEDS 18-20)" / "(Serves 4-6)" / "(SMALL FEEDS 8-10)" parenthetical
// out of a title, returning the cleaned title plus a short badge string. The
// first range before any "/" qualifier wins ("FEEDS 18-20/40-45PCS" → 18–20);
// piece counts are detail for the listing page, not the card. No match →
// feeds is null and the title comes back unchanged.
export function splitFeedsFromTitle(raw: string): {
  title: string;
  feeds: string | null;
} {
  const s = String(raw ?? "");
  const m = s.match(/\(\s*(?:SMALL\s+)?(?:FEEDS|SERVES)\s+([^()]+?)\s*\)/i);
  if (!m || m.index === undefined) return { title: s.trim(), feeds: null };
  const core = m[1].split("/")[0].trim().replace(/\s*-\s*/g, "–");
  if (!core) return { title: s.trim(), feeds: null };
  const title = (s.slice(0, m.index) + s.slice(m.index + m[0].length))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([:,.])/g, "$1")
    .trim()
    .replace(/[:\-–,]\s*$/, "")
    .trim();
  return { title: title || s.trim(), feeds: `Feeds ${core}` };
}
