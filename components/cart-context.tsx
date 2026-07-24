"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
  listingId: string;
  title: string;
  priceCents: number;
  photoUrl: string | null;
  quantity: number;
};
export type CartCook = {
  id: string;
  name: string;
  slug: string;
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
};
type Cart = { cook: CartCook; items: CartItem[] } | null;

export type LiveListing = { id: string; title: string; price_cents: number };

type CartContextValue = {
  cart: Cart;
  loaded: boolean;
  count: number;
  subtotalCents: number;
  addItem: (cook: CartCook, item: Omit<CartItem, "quantity">, qty?: number) => void;
  removeItem: (listingId: string) => void;
  setQty: (listingId: string, qty: number) => void;
  reconcile: (live: LiveListing[]) => { changed: string[]; removed: string[] };
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "homeplate_cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(null);
  const [loaded, setLoaded] = useState(false);

  // Load any saved cart on first mount (client only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCart(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  // Persist whenever the cart changes.
  useEffect(() => {
    if (!loaded) return;
    try {
      if (cart) localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [cart, loaded]);

  const addItem = useCallback(
    (cook: CartCook, item: Omit<CartItem, "quantity">, qty = 1) => {
      setCart((prev) => {
        // Cart holds one kitchen at a time (orders are per-kitchen).
        if (!prev || prev.cook.id !== cook.id) {
          return { cook, items: [{ ...item, quantity: qty }] };
        }
        const existing = prev.items.find((i) => i.listingId === item.listingId);
        const items = existing
          ? prev.items.map((i) =>
              i.listingId === item.listingId
                ? { ...i, quantity: i.quantity + qty }
                : i
            )
          : [...prev.items, { ...item, quantity: qty }];
        return { cook: prev.cook, items };
      });
    },
    []
  );

  const removeItem = useCallback((listingId: string) => {
    setCart((prev) => {
      if (!prev) return prev;
      const items = prev.items.filter((i) => i.listingId !== listingId);
      return items.length ? { cook: prev.cook, items } : null;
    });
  }, []);

  const setQty = useCallback((listingId: string, qty: number) => {
    setCart((prev) => {
      if (!prev) return prev;
      const items = prev.items
        .map((i) =>
          i.listingId === listingId ? { ...i, quantity: Math.max(0, qty) } : i
        )
        .filter((i) => i.quantity > 0);
      return items.length ? { cook: prev.cook, items } : null;
    });
  }, []);

  // Sync the saved cart against what the kitchen sells right now: refresh
  // stale titles/prices, drop items that are gone or unavailable, and report
  // what happened so the caller can tell the buyer. Prices in the cart are
  // display-only either way — checkout re-reads them from the database.
  const reconcile = useCallback((live: LiveListing[]) => {
    const changed: string[] = [];
    const removed: string[] = [];
    setCart((prev) => {
      if (!prev) return prev;
      const liveById = new Map(live.map((l) => [l.id, l]));
      const items: CartItem[] = [];
      for (const i of prev.items) {
        const now = liveById.get(i.listingId);
        if (!now) {
          removed.push(i.title);
          continue;
        }
        if (now.price_cents !== i.priceCents) changed.push(now.title);
        items.push({ ...i, title: now.title, priceCents: now.price_cents });
      }
      if (!changed.length && !removed.length) return prev;
      return items.length ? { cook: prev.cook, items } : null;
    });
    // De-dupe: React may run the updater twice in dev (strict mode).
    return { changed: [...new Set(changed)], removed: [...new Set(removed)] };
  }, []);

  const clear = useCallback(() => setCart(null), []);

  const count = useMemo(
    () => cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0,
    [cart]
  );
  const subtotalCents = useMemo(
    () => cart?.items.reduce((n, i) => n + i.priceCents * i.quantity, 0) ?? 0,
    [cart]
  );

  const value: CartContextValue = {
    cart,
    loaded,
    count,
    subtotalCents,
    addItem,
    removeItem,
    setQty,
    reconcile,
    clear,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
