"use client";

import Link from "next/link";
import { useCart } from "@/components/cart-context";

export default function CartButton() {
  const { count } = useCart();
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
