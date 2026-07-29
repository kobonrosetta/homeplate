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

// The location shown to shoppers BEFORE they order — the coarse neighborhood +
// city only. The exact pickup spot (home or a chosen meetup point) is never
// public; it's revealed post-order via pickupLocation() above. Null when
// nothing public is set.
export function publicArea(
  neighborhood?: string | null,
  city?: string | null
): string | null {
  const s = [neighborhood?.trim(), city?.trim()].filter(Boolean).join(", ");
  return s || null;
}
