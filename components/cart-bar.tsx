"use client";

import Link from "next/link";
import { useCart } from "@/components/cart-context";
import { formatUsd } from "@/lib/constants";

// Persistent bottom checkout affordance for shopping pages (kitchen +
// listing). Once something's in the cart, the only path to checkout was the
// header link — far away on a long menu, worst on mobile. This is the
// standard food-ordering pattern: a floating "N items · $total — View cart"
// pill fixed to the bottom.
//
// Deliberately styled as the CartToast's sibling (same width, same dark
// surface, same position, below it): when the add-to-cart toast
// fades out after 2.6s, this bar is what remains beneath it, so the
// transient confirmation appears to settle into the persistent one.
// Layering contract: toast z-[70] > replace-cart dialog z-[60] > this bar
// z-50 — the bar must never paint over (or stay clickable under) a modal.
export default function CartBar() {
  const { count, subtotalCents, loaded } = useCart();
  if (!loaded || count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <Link
        href="/cart"
        className="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink px-5 py-3 shadow-lift transition hover:bg-ink/90"
      >
        <span className="text-sm font-medium text-white">
          {count} {count === 1 ? "item" : "items"} ·{" "}
          {formatUsd(subtotalCents)}
        </span>
        <span className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-ink">
          View cart →
        </span>
      </Link>
    </div>
  );
}
