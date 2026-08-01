import posthog from "posthog-js";

// Product analytics via PostHog. Entirely opt-in: with NEXT_PUBLIC_POSTHOG_KEY
// unset, every call here is a silent no-op (same key-safe pattern as email).
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/** True when analytics is configured. */
export const analyticsEnabled = Boolean(KEY);

/**
 * Fire a product event. No-op on the server or when analytics is off, and it
 * never throws into the app — analytics must never break a user flow. Pass only
 * non-PII props (counts, cents, slugs) — never names, emails, or addresses.
 */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!KEY || typeof window === "undefined") return;
  try {
    posthog.capture(event, props);
  } catch {
    /* swallow — analytics is never load-bearing */
  }
}
