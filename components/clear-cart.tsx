"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart-context";

// Empties the cart on the order-confirmed page — but only AFTER the provider has
// finished loading from storage, so the loader can't repopulate what we cleared.
export default function ClearCart() {
  const { clear, loaded } = useCart();
  useEffect(() => {
    if (loaded) clear();
  }, [loaded, clear]);
  return null;
}
