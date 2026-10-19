// Display-layer helpers for a kitchen's menu page. Pure string functions —
// they never touch the data, only how it reads on screen — and unit-tested
// next to the fee math.
//
// Both lean on a naming convention 40 Acres already uses consistently
// ("BUFFET-STYLE: …", "FAMILY-STYLE: …", "(FEEDS 18-20)"), but degrade
// gracefully for kitchens that don't: no prefix match → everything lands in
// the catch-all section (and the page renders flat, unsectioned), no feeds
// parenthetical → title passes through untouched.

export type MenuSection = { id: string; title: string; tab: string };

// Order = what buyers actually buy. At 40 Acres (Oct 2026, 18 kept checkouts)
// plates/bowls/sides were in 16, buffet trays in 2, family dinners in 0 — so an
// everyday buyer meets a plate on screen 2 instead of screen 15, and trays stay
// one tap away via the pinned menu tabs. `tab` is the short label those tabs
// use (all three must fit a 390px phone).
export const MENU_SECTIONS: MenuSection[] = [
  { id: "plates-sides", title: "Plates, Bowls & Sides", tab: "Plates & sides" },
  { id: "trays", title: "Buffet Trays", tab: "Trays" },
  { id: "family-dinners", title: "Family Dinners", tab: "Family dinners" },
];

// The section ids a menu with these dish titles renders, in page order — or
// null when it should stay one flat grid. Only sectionize when the split is
// real (at least two sections with 2+ dishes each), so a kitchen that doesn't
// use the title convention keeps its plain grid.
export function sectionedMenuIds(titles: string[]): string[] | null {
  const counts = new Map<string, number>();
  for (const t of titles) {
    const id = menuSectionFor(t);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const big = MENU_SECTIONS.filter((s) => (counts.get(s.id) ?? 0) >= 2);
  if (big.length < 2) return null;
  return MENU_SECTIONS.filter((s) => (counts.get(s.id) ?? 0) > 0).map(
    (s) => s.id
  );
}

// Under a "Buffet Trays" / "Family Dinners" heading the title's own
// "BUFFET STYLE:" / "FAMILY-STYLE:" prefix is noise — drop it for display only
// (the cart keeps the full title). A title that is nothing but the prefix
// comes back unchanged.
export function stripSectionPrefix(title: string): string {
  const t = String(title ?? "").trim();
  const stripped = t.replace(/^(?:BUFFET|FAMILY)[\s-]*STYLE\s*:\s*/i, "").trim();
  return stripped || t;
}

// A dish title's size marker, if it has one: the feeds parenthetical
// ("(FEEDS 8-10)" → "Feeds 8–10") or a trailing piece count ("-48 EA" →
// "48 pcs"). `base` is the title with the marker removed.
export function sizeLabelFor(title: string): { base: string; size: string | null } {
  const { title: noFeeds, feeds } = splitFeedsFromTitle(title);
  if (feeds) return { base: noFeeds, size: feeds };
  const m = noFeeds.match(/\s*-\s*(\d+)\s*(?:EA|EACH|PCS?|PIECES|CT)\.?\s*$/i);
  if (m && m.index !== undefined) {
    const base = noFeeds.slice(0, m.index).trim();
    if (base) return { base, size: `${m[1]} pcs` };
  }
  return { base: noFeeds, size: null };
}

const sizeGroupKey = (base: string) =>
  base
    .toUpperCase()
    .replace(/\b(BUFFET|FAMILY)[\s-]*STYLE\b/g, "$1 STYLE")
    .replace(/\s+/g, " ")
    .replace(/[\s:–-]+$/, "")
    .trim();

export type SizeGroup<T> = {
  key: string;
  /** The shared title without its size marker (still with any section prefix). */
  title: string;
  /** One entry per size, in input order; a lone dish is a one-member group. */
  members: { item: T; size: string }[];
};

// Fold the same dish listed once per size ("… (FEEDS 8-10)" / "… (FEEDS
// 18-20)") into one group, so a menu shows one card with a row per size
// instead of near-identical cards. Deliberately conservative — a wrong merge
// would hide a dish under another's photo: only EXACT titles once the size
// marker is removed, and only when every member has a size and the sizes all
// differ. "ROASTED CHICKEN" and "HERB ROASTED CHICKEN" never merge. Groups
// keep the position of their first member.
export function groupSizeVariants<T extends { title: string }>(
  items: T[]
): SizeGroup<T>[] {
  const parsed = items.map((item) => {
    const { base, size } = sizeLabelFor(item.title);
    return { item, base, size, key: sizeGroupKey(base) };
  });
  const byKey = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const fam = byKey.get(p.key);
    if (fam) fam.push(p);
    else byKey.set(p.key, [p]);
  }
  const out: SizeGroup<T>[] = [];
  const emitted = new Set<string>();
  parsed.forEach((p, i) => {
    const fam = byKey.get(p.key)!;
    const sizes = fam.map((f) => f.size);
    const mergeable =
      fam.length >= 2 &&
      sizes.every((s) => !!s) &&
      new Set(sizes).size === sizes.length;
    if (!mergeable) {
      out.push({
        key: `${p.key}#${i}`,
        title: p.base,
        members: [{ item: p.item, size: p.size ?? "" }],
      });
      return;
    }
    if (emitted.has(p.key)) return;
    emitted.add(p.key);
    out.push({
      key: p.key,
      title: p.base,
      members: fam.map((f) => ({ item: f.item, size: f.size! })),
    });
  });
  return out;
}

// "8–20" from a set of titles' feeds markers (lowest to highest headcount), or
// null when none of them says how many it feeds.
export function feedsRange(titles: string[]): string | null {
  const nums: number[] = [];
  for (const t of titles) {
    const feeds = splitFeedsFromTitle(t).feeds;
    for (const n of (feeds ?? "").match(/\d+/g) ?? []) nums.push(Number(n));
  }
  if (nums.length === 0) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

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
