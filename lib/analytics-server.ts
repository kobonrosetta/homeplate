import { PostHog } from "posthog-node";

// Server-side PostHog, for events that fire inside server actions (signup,
// kitchen created, listing posted) where the browser SDK can't reach. Singleton,
// and a silent no-op when analytics is off. Reuses the same project key as the
// client (NEXT_PUBLIC_POSTHOG_KEY is a normal env var server-side too).
//
// distinctId should be the user's profile id so a chef's server events line up
// with each other into one activation funnel (signup -> kitchen -> listing).
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let client: PostHog | null = null;
function getClient(): PostHog | null {
  if (!KEY) return null;
  if (!client) {
    // flushAt: 1 sends each event immediately — pilot volume is tiny, and it
    // means an event is never stranded in a buffer if the process cycles.
    client = new PostHog(KEY, { host: HOST, flushAt: 1, flushInterval: 0 });
  }
  return client;
}

/**
 * Capture a server-side product event. No-op when analytics is off or no
 * distinctId. Fire-and-forget; never throws into the calling flow. Pass only
 * non-PII properties (counts, flags, enums) — never names/emails/addresses.
 */
export function captureServer(
  distinctId: string | null | undefined,
  event: string,
  properties?: Record<string, unknown>
): void {
  const c = getClient();
  if (!c || !distinctId) return;
  try {
    c.capture({ distinctId, event, properties });
  } catch {
    /* analytics is never load-bearing */
  }
}
