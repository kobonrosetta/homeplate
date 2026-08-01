"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

// Fires a single analytics event once on mount. Lets a server component record
// a conversion (e.g. an order confirmed) by dropping this in its tree. No-op
// when analytics is off.
export default function TrackEvent({
  event,
  props,
}: {
  event: string;
  props?: Record<string, unknown>;
}) {
  useEffect(() => {
    track(event, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
