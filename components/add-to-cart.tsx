"use client";

import { useEffect, useState } from "react";
import { useCart, type CartCook } from "@/components/cart-context";

export default function AddToCart({
  cook,
  item,
}: {
  cook: CartCook;
  item: {
    listingId: string;
    title: string;
    priceCents: number;
    photoUrl: string | null;
    optionIds?: string[];
    optionsLabel?: string;
  };
}) {
  const { cart, addItem } = useCart();
  const [added, setAdded] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  function doAdd() {
    addItem(cook, item, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  }

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    // The cart holds one kitchen at a time (orders are per-kitchen). Adding from
    // a different kitchen replaces it — confirm first so a buyer never loses an
    // in-progress cart by surprise.
    if (cart && cart.cook.id !== cook.id) {
      setConfirmReplace(true);
      return;
    }
    doAdd();
  }

  return (
    <>
      <button
        onClick={handleAdd}
        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
      >
        {added ? "Added ✓" : "Add to cart"}
      </button>

      {confirmReplace && cart && (
        <ReplaceCartDialog
          currentName={cart.cook.name}
          newName={cook.name}
          onCancel={() => setConfirmReplace(false)}
          onConfirm={() => {
            setConfirmReplace(false);
            doAdd();
          }}
        />
      )}
    </>
  );
}

function ReplaceCartDialog({
  currentName,
  newName,
  onCancel,
  onConfirm,
}: {
  currentName: string;
  newName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Escape closes; lock the background scroll while the dialog is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-cart-title"
      onClick={onCancel}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rise w-full max-w-sm rounded-2xl bg-card p-6 shadow-lift"
      >
        <h2
          id="replace-cart-title"
          className="font-display text-lg font-semibold text-ink"
        >
          Start a new cart?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your cart has items from{" "}
          <span className="font-medium text-ink">{currentName}</span>. You can
          only order from one kitchen at a time, so starting a cart from{" "}
          <span className="font-medium text-ink">{newName}</span> will empty it.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onCancel}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-bg"
          >
            Keep my cart
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
          >
            Start new cart
          </button>
        </div>
      </div>
    </div>
  );
}
