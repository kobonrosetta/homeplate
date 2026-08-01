"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCart, type LiveListing } from "@/components/cart-context";

// Carts live in localStorage indefinitely, so a saved item's price or
// availability can drift from what the kitchen sells today. On mount, check
// the cart against the live listings, fix it up, and tell the buyer what
// changed — so the total they see is the total Stripe will charge.
// (The server re-checks at checkout regardless; this keeps that bounce from
// ever looping, because the cart has already healed itself.)
export default function CartSync() {
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
      .select("id, title, price_cents")
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
        if (error || !data || opts?.error) return; // offline etc. — the server still re-checks
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
      }
    );
  }, [loaded, cart, reconcile]);

  if (!notice) return null;
  return (
    <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {notice}
    </p>
  );
}
