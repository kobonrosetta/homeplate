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

// The one-liner for the chef strip at the top of the kitchen page: the
// cook-written tagline when set, else the first sentence of the bio,
// capped so it stays one line. Null (no tagline, no bio) hides the line —
// the strip still shows the face + name.
export function cookTagline(
  tagline: string | null | undefined,
  bio: string | null | undefined
): string | null {
  // Code-point-safe one-line cap (a plain .slice can cut an emoji in half,
  // leaving a lone surrogate rendering as \ufffd before the ellipsis).
  const cap = (x: string) => {
    const cps = Array.from(x);
    return cps.length > 120 ? cps.slice(0, 117).join("").trimEnd() + "…" : x;
  };
  const t = (tagline ?? "").trim();
  if (t) return cap(t);
  const b = (bio ?? "").trim();
  if (!b) return null;
  // First sentence, abbreviation-proof: a terminator only counts when it's
  // followed by whitespace/end AND at least ~20 chars in — otherwise "Born in
  // St. Louis…" would yield the storefront line "Born in St.". No qualifying
  // terminator → the whole bio, capped.
  let first = b;
  const re = /[.!?](?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(b))) {
    if (m.index >= 19) {
      first = b.slice(0, m.index + 1);
      break;
    }
  }
  first = first.trim();
  // A degenerate "sentence" with no real content (punctuation-only bios)
  // hides the line rather than rendering noise.
  if (!/[\p{L}\p{N}]/u.test(first)) return null;
  return cap(first);
}
