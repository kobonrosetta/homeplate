"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCart, type LiveListing } from "@/components/cart-context";
import {
  availabilityFromListing,
  computeReadyBy,
  isOrderable,
  pacificTodayIso,
} from "@/lib/availability";

// Carts live in localStorage indefinitely, so a saved item's price or
// availability can drift from what the kitchen sells today. On mount, check
// the cart against the live listings, fix it up, and tell the buyer what
// changed — so the total they see is the total Stripe will charge.
// (The server re-checks at checkout regardless; this keeps that bounce from
// ever looping, because the cart has already healed itself.)
// What the checkout date picker needs from the live cart: the UNPUSHED
// lead-time floor (latest ready-by across lines before any handoff-day push
// — the exact number the server's floor check uses) plus each line's mode and
// ready-by, so the client can mirror the server's "soonest" (preorder lines
// keep their cook-set date; the rest are pushed to the chosen window's days).
export type CartReadiness = {
  floor: string | null;
  lines: { mode: string; readyBy: string }[];
};

// `onReadiness` (optional) is always called once the live check settles —
// with empty data when the fetch fails — so a picker waiting on it never
// waits forever.
export default function CartSync({
  onReadiness,
}: {
  onReadiness?: (r: CartReadiness) => void;
} = {}) {
  const { cart, loaded, reconcile } = useCart();
  const [notice, setNotice] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!loaded || !cart || ran.current) return;
    ran.current = true;

    const ids = cart.items.map((i) => i.listingId);
    const optionIds = [...new Set(cart.items.flatMap((i) => i.optionIds ?? []))];
    const supabase = createClient();
    const listingsQ = supabase
      .from("listings")
      .select(
        "id, title, price_cents, fulfillment_mode, lead_days, ready_date, order_by"
      )
      .in("id", ids)
      .eq("is_available", true);
    // Option deltas are public menu data — lines with options heal their
    // price as base + deltas, same math the server re-derives at checkout.
    const optionsQ = optionIds.length
      ? supabase
          .from("listing_options")
          .select("id, price_delta_cents")
          .in("id", optionIds)
      : Promise.resolve({ data: [], error: null });
    // The cook snapshot (pickup windows, delivery) heals too — a window the
    // cook deleted must not survive in an old cart to be chosen at checkout.
    const cookQ = supabase
      .from("cooks")
      .select("id, business_name, pickup_available, delivery_available, pickup_windows")
      .eq("id", cart.cook.id)
      .eq("status", "active")
      .maybeSingle();
    Promise.all([listingsQ, optionsQ, cookQ]).then(
      ([{ data, error }, opts, cookRes]: [any, any, any]) => {
        if (error || !data || opts?.error) {
          // offline etc. — the server still re-checks; the picker just
          // starts from today.
          onReadiness?.({ floor: null, lines: [] });
          return;
        }
        const liveCook = cookRes?.data
          ? {
              id: cookRes.data.id as string,
              name: cookRes.data.business_name as string,
              pickupAvailable: !!cookRes.data.pickup_available,
              deliveryAvailable: !!cookRes.data.delivery_available,
              pickupWindows: (cookRes.data.pickup_windows ?? []) as string[],
            }
          : undefined;
        const { changed, removed } = reconcile(
          data as LiveListing[],
          (opts?.data ?? []) as { id: string; price_delta_cents: number }[],
          liveCook
        );
        const parts: string[] = [];
        if (removed.length)
          parts.push(`no longer available: ${removed.join(", ")}`);
        if (changed.length)
          parts.push(`price updated: ${changed.join(", ")}`);
        if (parts.length) setNotice(`We updated your cart: ${parts.join("; ")}.`);
        // Readiness for what's actually in the cart, from the same live rows:
        // each orderable line's mode + unpushed ready-by, and their max as
        // the floor — mirroring the server's leadFloor exactly. Unorderable
        // lines contribute nothing; the server bounces those to the cart.
        if (onReadiness) {
          const today = pacificTodayIso();
          const lines: CartReadiness["lines"] = [];
          let floor: string | null = null;
          for (const l of data as any[]) {
            if (!ids.includes(l.id)) continue;
            const a = availabilityFromListing(l);
            const rb = isOrderable(a, today) ? computeReadyBy(a, today) : null;
            if (!rb) continue;
            lines.push({ mode: a.mode, readyBy: rb });
            if (!floor || rb > floor) floor = rb;
          }
          onReadiness({ floor, lines });
        }
      }
    );
  }, [loaded, cart, reconcile, onReadiness]);

  if (!notice) return null;
  return (
    <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {notice}
    </p>
  );
}
