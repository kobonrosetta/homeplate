"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/cart-context";

// Confirms "Added to cart" after any add, anywhere. It lives at the bottom
// center (the mobile thumb zone) because the cart badge sits in the header —
// off-screen while a buyer reads a dish — so a header-only update reads as
// "nothing happened". Slides up, auto-dismisses, and offers a one-tap path to
// checkout. Driven by cart-context's `justAdded` nonce, so it fires on every
// add (including re-adding the same dish). Mounted once, in the root layout.
export default function CartToast() {
  const { justAdded, count } = useCart();
  const [show, setShow] = useState(false);
  // Latch the content so it stays put through the slide-out (justAdded never
  // clears, but we don't want a flash if it ever did).
  const [msg, setMsg] = useState<{ title: string; photoUrl: string | null } | null>(
    null
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!justAdded) return;
    setMsg({ title: justAdded.title, photoUrl: justAdded.photoUrl });
    setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Re-run on every add, even the same dish twice, via the monotonic nonce.
  }, [justAdded?.nonce]);

  if (!msg) return null;

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-all duration-300 ease-out ${
        show ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
    >
      <div
        className={`flex w-full max-w-sm items-center gap-3 rounded-2xl bg-ink px-4 py-3 shadow-lift ${
          show ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        {msg.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={msg.photoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Added to cart ✓</p>
          <p className="truncate text-xs text-white/70">{msg.title}</p>
        </div>
        <Link
          href="/cart"
          className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-ink hover:bg-white/90"
        >
          View cart{count > 0 ? ` · ${count}` : ""}
        </Link>
      </div>
    </div>
  );
}
