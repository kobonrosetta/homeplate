// Shared helpers for the pickup/delivery handoff so the success page, the
// buyer's Purchases page, and the confirmation email all describe it the same
// way.

// The pickup location shown to a buyer AFTER they've paid: street + city (the
// street lives in the owner-only cook_private table, so this is only ever
// assembled server-side with the admin client). Null when the cook hasn't set
// a street address yet.
export function pickupLocation(
  streetAddress?: string | null,
  city?: string | null
): string | null {
  const s = [streetAddress, city].filter(Boolean).join(", ");
  return s || null;
}
