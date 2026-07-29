// Central place for the HomePlate business rules.
// Change the fee here and it updates everywhere.

/** Buyer-side service fee, charged on top of the cook's price. */
export const SERVICE_FEE_PERCENT = 0.08; // 8%
/** Flat fee added to cover Stripe's fixed per-transaction cost (~$0.30). */
export const SERVICE_FEE_FLAT_CENTS = 30; // $0.30

/** Photos scoring below this (0-100, from the AI vision check) are rejected. */
export const MIN_PHOTO_SCORE = 40;

/**
 * The site's public origin, for absolute URLs in emails, share links, and
 * social-card metadata. At go-live: set NEXT_PUBLIC_SITE_URL on Render (and
 * update the fallback) — this constant is the ONLY place the host lives.
 * (Server actions that redirect within a request use the forwarded host
 * instead, on purpose — they should respect whatever host served them.)
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://homeplate-jyd2.onrender.com";

/**
 * The cook keeps 100% of `subtotalCents`.
 * The buyer pays `subtotalCents + serviceFee`.
 * HomePlate keeps the service fee (minus Stripe's cut).
 */
export function calcServiceFeeCents(subtotalCents: number): number {
  if (subtotalCents <= 0) return 0;
  return Math.round(subtotalCents * SERVICE_FEE_PERCENT) + SERVICE_FEE_FLAT_CENTS;
}

export function calcTotalCents(subtotalCents: number): number {
  return subtotalCents + calcServiceFeeCents(subtotalCents);
}

/** Format integer cents as a USD string, e.g. 1234 -> "$12.34". */
export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
