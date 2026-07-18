"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/cart-context";
import { createClient } from "@/lib/supabase/client";
import { calcServiceFeeCents, formatUsd } from "@/lib/constants";
import { startCheckout } from "@/app/checkout/actions";

const INPUT =
  "w-full rounded-lg border border-line bg-card px-3 py-2 text-ink outline-none focus:border-muted";

export default function CheckoutForm({
  defaultName,
  defaultPhone,
  defaultEmail,
  signedIn,
}: {
  defaultName: string;
  defaultPhone: string;
  defaultEmail: string;
  signedIn: boolean;
}) {
  const { cart, subtotalCents } = useCart();
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const readyRef = useRef(false);

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-line px-4 py-16 text-center text-muted">
        Your cart is empty.{" "}
        <Link href="/browse" className="text-brand hover:underline">
          Browse kitchens
        </Link>
      </div>
    );
  }

  const fee = calcServiceFeeCents(subtotalCents);
  const total = subtotalCents + fee;
  const canDeliver = cart.cook.deliveryAvailable ?? false;
  const items = cart.items.map((i) => ({
    listingId: i.listingId,
    quantity: i.quantity,
  }));

  // First submit: make sure there's a session (guests get an anonymous one),
  // then re-submit so the server action runs with that session. The readyRef
  // lets the second, native submit pass straight through to the server action.
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (readyRef.current) return;
    e.preventDefault();
    const form = e.currentTarget;
    setErr(null);
    setPending(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
      readyRef.current = true;
      form.requestSubmit();
    } catch {
      setPending(false);
      setErr("Couldn't start checkout. Please try again.");
    }
  }

  return (
    <form action={startCheckout} onSubmit={onSubmit} className="mt-6 space-y-6">
      <input type="hidden" name="cook_id" value={cart.cook.id} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <input type="hidden" name="fulfillment" value={fulfillment} />

      <p className="text-sm text-muted">
        Ordering from{" "}
        <span className="font-medium text-ink">{cart.cook.name}</span>
        {!signedIn && (
          <>
            {" · "}
            <Link href="/login" className="text-brand hover:underline">
              Sign in
            </Link>{" "}
            for faster checkout
          </>
        )}
      </p>

      {err && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>
      )}

      <Field label="Your name">
        <input
          name="contact_name"
          defaultValue={defaultName}
          placeholder="Jane Doe"
          className={INPUT}
        />
      </Field>

      <Field label="Email — for your receipt and order updates">
        <input
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
          placeholder="you@example.com"
          className={INPUT}
        />
      </Field>

      <Field label="Phone — so the kitchen can reach you about this order">
        <input
          name="contact_phone"
          required
          inputMode="tel"
          defaultValue={defaultPhone}
          placeholder="(408) 555-0139"
          className={INPUT}
        />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">How do you want it?</p>
        <div className="flex gap-3">
          <Choice
            active={fulfillment === "pickup"}
            onClick={() => setFulfillment("pickup")}
            label="Pickup"
          />
          {canDeliver && (
            <Choice
              active={fulfillment === "delivery"}
              onClick={() => setFulfillment("delivery")}
              label="Delivery"
            />
          )}
        </div>
      </div>

      {fulfillment === "pickup" ? (
        <Field label="Preferred pickup time (optional)">
          <input
            name="pickup_time"
            placeholder="e.g. Saturday afternoon"
            className={INPUT}
          />
          <p className="mt-1 text-xs text-faint">
            The kitchen shares the exact pickup address once you&apos;ve paid.
          </p>
        </Field>
      ) : (
        <Field label="Delivery address">
          <input
            name="delivery_address"
            required
            placeholder="123 Main St, Sunnyvale"
            className={INPUT}
          />
        </Field>
      )}

      <Field label="Note for the kitchen (optional)">
        <textarea
          name="notes"
          rows={2}
          placeholder="Allergies, gate code, anything they should know"
          className={INPUT}
        />
      </Field>

      <div className="space-y-2 rounded-xl border border-line p-4 text-sm">
        <Row label="Subtotal (the cook receives this)" value={formatUsd(subtotalCents)} />
        <Row label="Service fee (8% + $0.30)" value={formatUsd(fee)} />
        <div className="border-t border-line pt-2">
          <Row label="Total" value={formatUsd(total)} bold />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90 disabled:opacity-60"
      >
        {pending ? "Taking you to payment…" : `Pay ${formatUsd(total)}`}
      </button>
      <p className="text-center text-xs text-faint">
        No account needed — pay as a guest. Secure payment by Stripe.
      </p>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function Choice({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-5 py-2 text-sm font-medium transition ${
        active
          ? "border-brand bg-brand text-white"
          : "border-line text-ink hover:border-muted"
      }`}
    >
      {label}
    </button>
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
