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
    const supabase = createClient();
    supabase
      .from("listings")
      .select("id, title, price_cents")
      .in("id", ids)
      .eq("is_available", true)
      .then(({ data, error }) => {
        if (error || !data) return; // offline etc. — the server still re-checks
        const { changed, removed } = reconcile(data as LiveListing[]);
        const parts: string[] = [];
        if (removed.length)
          parts.push(`no longer available: ${removed.join(", ")}`);
        if (changed.length)
          parts.push(`price updated: ${changed.join(", ")}`);
        if (parts.length) setNotice(`We updated your cart — ${parts.join("; ")}.`);
      });
  }, [loaded, cart, reconcile]);

  if (!notice) return null;
  return (
    <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {notice}
    </p>
  );
}
