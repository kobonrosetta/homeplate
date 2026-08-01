"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";

// Initializes PostHog and records a pageview on every route change. Renders
// nothing, and is entirely inert when NEXT_PUBLIC_POSTHOG_KEY is unset —
// analytics is opt-in via env, like the email keys.
//
// PII posture: session recording is OFF, and PostHog's autocapture masks text
// typed into inputs/textareas by default, so buyer contact details and chef
// addresses are never captured. Only explicit track() events (counts, cents,
// slugs) and pageviews are sent.
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

export default function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    if (!KEY || typeof window === "undefined") return;
    // posthog.__loaded guards against re-init on client navigation / HMR.
    if (!(posthog as unknown as { __loaded?: boolean }).__loaded) {
      posthog.init(KEY, {
        api_host: HOST,
        capture_pageview: false, // captured manually on route change below
        disable_session_recording: true,
        autocapture: true,
      });
    }
  }, []);

  useEffect(() => {
    if (!KEY || typeof window === "undefined") return;
    posthog.capture("$pageview");
  }, [pathname]);

  return null;
}
