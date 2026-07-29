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
  priceCents: number; // display only — checkout re-derives from the DB
  photoUrl: string | null;
  quantity: number;
  optionIds?: string[]; // chosen item options (size, character, …)
  optionsLabel?: string; // e.g. '7" · Bear' — display only
};

// Same listing + same option choices = same cart line.
export function lineKey(i: {
  listingId: string;
  optionIds?: string[];
}): string {
  const opts = [...(i.optionIds ?? [])].sort();
  return opts.length ? `${i.listingId}|${opts.join(",")}` : i.listingId;
}
export type CartCook = {
  id: string;
  name: string;
  slug: string;
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
  pickupWindows?: string[]; // cook-defined windows offered at checkout
};
type Cart = { cook: CartCook; items: CartItem[] } | null;

export type LiveListing = { id: string; title: string; price_cents: number };
export type LiveOption = { id: string; price_delta_cents: number };

type CartContextValue = {
  cart: Cart;
  loaded: boolean;
  count: number;
  subtotalCents: number;
  addItem: (cook: CartCook, item: Omit<CartItem, "quantity">, qty?: number) => void;
  removeItem: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  reconcile: (
    live: LiveListing[],
    liveOptions?: LiveOption[],
    liveCook?: Partial<CartCook> & { id: string }
  ) => { changed: string[]; removed: string[] };
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
        const key = lineKey(item);
        const existing = prev.items.find((i) => lineKey(i) === key);
        const items = existing
          ? prev.items.map((i) =>
              lineKey(i) === key ? { ...i, quantity: i.quantity + qty } : i
            )
          : [...prev.items, { ...item, quantity: qty }];
        // Adopt the incoming cook object: it comes from a freshly
        // server-rendered page, so pickup windows / delivery info heal on
        // every add instead of fossilizing at first-add time.
        return { cook, items };
      });
    },
    []
  );

  const removeItem = useCallback((key: string) => {
    setCart((prev) => {
      if (!prev) return prev;
      const items = prev.items.filter((i) => lineKey(i) !== key);
      return items.length ? { cook: prev.cook, items } : null;
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setCart((prev) => {
      if (!prev) return prev;
      const items = prev.items
        .map((i) =>
          lineKey(i) === key ? { ...i, quantity: Math.max(0, qty) } : i
        )
        .filter((i) => i.quantity > 0);
      return items.length ? { cook: prev.cook, items } : null;
    });
  }, []);

  // Sync the saved cart against what the kitchen sells right now: refresh
  // stale titles/prices, drop items that are gone or unavailable, heal the
  // cook snapshot (pickup windows, delivery info), and report what happened
  // so the caller can tell the buyer. Prices in the cart are display-only
  // either way — checkout re-reads them from the database.
  const reconcile = useCallback(
    (
      live: LiveListing[],
      liveOptions?: LiveOption[],
      liveCook?: Partial<CartCook> & { id: string }
    ) => {
      const changed: string[] = [];
      const removed: string[] = [];
      setCart((prev) => {
        if (!prev) return prev;
        const liveById = new Map(live.map((l) => [l.id, l]));
        const deltaById = new Map(
          (liveOptions ?? []).map((o) => [o.id, o.price_delta_cents])
        );
        const items: CartItem[] = [];
        for (const i of prev.items) {
          const now = liveById.get(i.listingId);
          if (!now) {
            removed.push(i.title);
            continue;
          }
          // A line's live price = listing base + its chosen option deltas. If
          // any chosen option vanished, drop the line (its price is unknowable).
          const opts = i.optionIds ?? [];
          if (opts.length && !opts.every((id) => deltaById.has(id))) {
            removed.push(i.title);
            continue;
          }
          const livePrice =
            now.price_cents +
            opts.reduce((n, id) => n + (deltaById.get(id) ?? 0), 0);
          if (livePrice !== i.priceCents) changed.push(now.title);
          items.push({ ...i, title: now.title, priceCents: livePrice });
        }
        // Cook snapshot heals too — windows a cook deleted must not survive
        // in an old cart to be bought at checkout.
        const cook =
          liveCook && liveCook.id === prev.cook.id
            ? { ...prev.cook, ...liveCook }
            : prev.cook;
        const cookChanged = JSON.stringify(cook) !== JSON.stringify(prev.cook);
        if (!changed.length && !removed.length && !cookChanged) return prev;
        return items.length ? { cook, items } : null;
      });
      // De-dupe: React may run the updater twice in dev (strict mode).
      return { changed: [...new Set(changed)], removed: [...new Set(removed)] };
    },
    []
  );

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
