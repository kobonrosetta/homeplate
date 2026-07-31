"use client";

import Link from "next/link";
import { useCart } from "@/components/cart-context";

// The cart link + item-count badge. Two forms: the inline text link (desktop
// nav) and a compact icon (`icon`) for the persistent mobile header slot, so a
// phone buyer always sees their cart instead of it hiding in the hamburger.
export default function CartButton({ icon = false }: { icon?: boolean }) {
  const { count } = useCart();

  if (icon) {
    return (
      <Link
        href="/cart"
        aria-label={
          count > 0 ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart"
        }
        className="relative p-2 text-ink"
      >
        <CartIcon />
        {count > 0 && (
          <span className="absolute right-0 top-0 min-w-[1.1rem] rounded-full bg-brand px-1 py-0.5 text-center text-[10px] font-medium leading-none text-white">
            {count}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link href="/cart" className="text-muted hover:text-ink">
      Cart
      {count > 0 && (
        <span className="ml-1 rounded-full bg-brand px-1.5 py-0.5 text-xs font-medium text-white">
          {count}
        </span>
      )}
    </Link>
  );
}

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6h15l-1.5 9h-12L5 3H2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="20" r="1.5" fill="currentColor" />
      <circle cx="18" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}
