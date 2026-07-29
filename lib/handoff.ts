// Shared helpers for the pickup/delivery handoff so the success page, the
// buyer's Purchases page, the confirmation email, and the browse/kitchen
// pages all describe location the same way.

// The pickup detail shown to a buyer AFTER they've paid. A cook-published
// public handoff spot (cooks.pickup_location — a meetup point or their home if
// they chose to publish it) WINS; otherwise fall back to the private home
// street (cook_private.street_address, only ever assembled server-side with
// the admin client) + city. Null when nothing is set.
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

// The location shown to shoppers BEFORE they order (public data only). A
// cook-published pickup spot is exact; otherwise the coarse neighborhood +
// city — never the home address. Null when nothing public is set.
export function publicArea(
  pickupSpot?: string | null,
  neighborhood?: string | null,
  city?: string | null
): string | null {
  const spot = pickupSpot?.trim();
  if (spot) return spot;
  const s = [neighborhood?.trim(), city?.trim()].filter(Boolean).join(", ");
  return s || null;
}
