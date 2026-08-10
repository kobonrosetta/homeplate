// Shared helpers for the pickup/delivery handoff so the success page, the
// buyer's Purchases page, the confirmation email, and the browse/kitchen
// pages all describe location the same way.

// The pickup detail shown to a buyer AFTER they've paid. A cook-chosen handoff
// spot (cook_private.pickup_location — a meetup point, or their home address if
// they preferred that) WINS; otherwise fall back to the private home street
// (cook_private.street_address) + city. Both are only ever assembled
// server-side with the admin client, and neither is ever shown pre-order. Null
// when nothing is set.
export function pickupLocation(
  streetAddress?: string | null,
  city?: string | null,
  pickupSpot?: string | null
): string | null {
  const spot = pickupSpot?.trim();
  if (spot) return spot;
  const s = [streetAddress, city].filter(Boolean).join(", ");
  return s || null;
}

// Capitalize one segment of a place name — but ONLY if the typist didn't
// deliberately case it: a segment that's uniformly lowercase ("campbell") or
// uniformly UPPERCASE ("CAMPBELL") normalizes to "Campbell", while mixed-case
// ("McKinley", "SoFA" — real San Jose names) passes through untouched. This is
// what keeps the normalizer from corrupting names it can't understand.
function capSegment(w: string): string {
  if (!w) return w;
  if (w !== w.toLowerCase() && w !== w.toUpperCase()) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

// Normalize a free-typed place name to a clean, consistent display form:
// "campbell" / "CAMPBELL" become "Campbell"; hyphen/slash compounds normalize
// per segment ("cambrian-pioneer" → "Cambrian-Pioneer", "burbank/del monte" →
// "Burbank/Del Monte"); deliberately mixed-case words are left alone (see
// capSegment). Idempotent, so it's safe to apply on write AND on display.
// Returns "" for empty/null input.
export function titleCase(s?: string | null): string {
  return (s ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w
        .split(/([-/])/)
        .map((seg) => (seg === "-" || seg === "/" ? seg : capSegment(seg)))
        .join("")
    )
    .join(" ");
}

// The location shown to shoppers BEFORE they order — the coarse neighborhood +
// city only. The exact pickup spot (home or a chosen meetup point) is never
// public; it's revealed post-order via pickupLocation() above. Null when
// nothing public is set. Title-cased so the label reads clean no matter how the
// cook typed it (a display safety net on top of the write-time normalization).
export function publicArea(
  neighborhood?: string | null,
  city?: string | null
): string | null {
  const s = [titleCase(neighborhood), titleCase(city)]
    .filter(Boolean)
    .join(", ");
  return s || null;
}
