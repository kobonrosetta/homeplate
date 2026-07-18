"use client";

import { useState } from "react";
import { useCart, type CartCook } from "@/components/cart-context";

export default function AddToCart({
  cook,
  item,
}: {
  cook: CartCook;
  item: { listingId: string; title: string; priceCents: number; photoUrl: string | null };
}) {
  const { cart, addItem } = useCart();
  const [added, setAdded] = useState(false);

  function handleAdd() {
    if (cart && cart.cook.id !== cook.id) {
      const ok = window.confirm(
        `Your cart has items from ${cart.cook.name}. Start a new cart from ${cook.name} instead?`
      );
      if (!ok) return;
    }
    addItem(cook, item, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  }

  return (
    <button
      onClick={handleAdd}
      className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
    >
      {added ? "Added ✓" : "Add to cart"}
    </button>
  );
}
