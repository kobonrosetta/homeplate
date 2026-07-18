"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart-context";
import { formatUsd, calcServiceFeeCents } from "@/lib/constants";

export default function CartPage() {
  const { cart, subtotalCents, setQty, removeItem } = useCart();
  const router = useRouter();

  if (!cart || cart.items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-ink">Your cart is empty</h1>
        <p className="mt-2 text-muted">
          Find something delicious from a local kitchen.
        </p>
        <Link
          href="/browse"
          className="mt-6 inline-block rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
        >
          Browse kitchens
        </Link>
      </main>
    );
  }

  const fee = calcServiceFeeCents(subtotalCents);
  const total = subtotalCents + fee;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Your cart</h1>
      <p className="mt-1 text-muted">
        From{" "}
        <Link
          href={`/kitchen/${cart.cook.slug}`}
          className="font-medium text-brand hover:underline"
        >
          {cart.cook.name}
        </Link>
      </p>

      <ul className="mt-6 divide-y divide-line rounded-lg border border-line">
        {cart.items.map((i) => (
          <li key={i.listingId} className="flex items-center gap-4 px-4 py-4">
            {i.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={i.photoUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-line text-faint">
                🍽️
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{i.title}</p>
              <p className="text-sm text-muted">{formatUsd(i.priceCents)}</p>
            </div>
            <input
              type="number"
              min={0}
              value={i.quantity}
              onChange={(e) =>
                setQty(i.listingId, parseInt(e.target.value || "0", 10))
              }
              className="w-16 rounded-lg border border-line px-2 py-1 text-center"
            />
            <button
              onClick={() => removeItem(i.listingId)}
              className="text-sm text-red-600 hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-2 rounded-lg border border-line p-4 text-sm">
        <Row label="Subtotal (your cook receives this)" value={formatUsd(subtotalCents)} />
        <Row label="Service fee (8% + $0.30)" value={formatUsd(fee)} />
        <div className="border-t border-line pt-2">
          <Row label="Total" value={formatUsd(total)} bold />
        </div>
      </div>

      <button
        onClick={() => router.push("/checkout")}
        className="mt-6 w-full rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
      >
        Proceed to checkout
      </button>
    </main>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${
        bold ? "font-semibold text-ink" : "text-muted"
      }`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
