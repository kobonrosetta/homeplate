"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useCart } from "@/components/cart-context";
import CartSync, { type CartReadiness } from "@/components/cart-sync";
import {
  calcServiceFeeCents,
  formatUsd,
  MAX_EVENT_DAYS_OUT,
} from "@/lib/constants";
import {
  addDaysIso,
  formatDateShort,
  nextHandoffIso,
  pacificTodayIso,
  parsePickupDays,
  pickupDatesFrom,
} from "@/lib/availability";
import { startCheckout } from "@/app/checkout/actions";
import { track } from "@/lib/analytics";

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
  const { cart, loaded, subtotalCents } = useCart();
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  // Picker hints only (server re-validates): set after mount so SSR and
  // hydration agree — a date computed during render would differ between the
  // UTC server and the browser. Pacific on purpose, matching the server's
  // notion of "today" so the picker never offers a date Pay then rejects.
  const [todayIso, setTodayIso] = useState("");
  useEffect(() => {
    setTodayIso(pacificTodayIso());
  }, []);
  const dateMax = todayIso ? addDaysIso(todayIso, MAX_EVENT_DAYS_OUT) : "";
  // Which pickup window the buyer chose (null = the first one). Controlled so
  // the date choices below can follow the window's days.
  const [pickupChoice, setPickupChoice] = useState<string | null>(null);
  // Live readiness of the cart (lead-time floor + per-line modes), reported
  // by CartSync once its check settles. null = not reported yet, and the
  // date picker waits for it rather than offering dates that then vanish.
  const [readiness, setReadiness] = useState<CartReadiness | null>(null);

  // Don't flash "your cart is empty" before localStorage has been read.
  if (!loaded) return null;

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
  // priceCents/title let the server compare what the buyer SAW against the
  // authoritative DB prices and bounce on drift — never to price the order.
  const items = cart.items.map((i) => ({
    listingId: i.listingId,
    quantity: i.quantity,
    priceCents: i.priceCents,
    title: i.title,
    optionIds: i.optionIds ?? [],
  }));

  const windows = cart.cook.pickupWindows ?? [];
  // The chosen window, or the first one; a choice CartSync's reconcile has
  // since deleted falls back too, so the date list never follows a window
  // the visible select no longer shows.
  const pickupTime =
    pickupChoice === "" || (pickupChoice && windows.includes(pickupChoice))
      ? pickupChoice
      : windows[0] ?? "";
  // Days the chosen window runs (falling back to the union of all windows,
  // exactly like the server); null when the schedule can't be read.
  const windowDays = pickupTime
    ? parsePickupDays([pickupTime]) ?? parsePickupDays(windows)
    : null;
  const readyBy = readiness?.floor ?? null;
  // Earliest date the picker may offer: the cart's unpushed lead-time floor
  // (the server's leadFloor), never before today.
  const floor =
    readyBy && todayIso && readyBy > todayIso ? readyBy : todayIso;
  // A preorder dish's cook-set date is always offerable — it's the cook's
  // explicit plan, even off the weekly schedule — and the server exempts it
  // from the weekday rule for the same reason.
  const preorderDates = (readiness?.lines ?? [])
    .filter((l) => l.mode === "preorder")
    .map((l) => l.readyBy);
  const pickupDates =
    todayIso && windowDays
      ? [
          ...new Set([
            ...pickupDatesFrom(todayIso, windowDays, MAX_EVENT_DAYS_OUT),
            ...preorderDates,
          ]),
        ]
          .filter((d) => d >= floor && d <= dateMax)
          .sort()
      : [];
  // What the server will stamp if the buyer leaves "Soonest available":
  // preorder lines keep their date, every other line is pushed to the chosen
  // window's days — the latest wins. Mirrors computeGetIt line by line.
  const soonest = (() => {
    if (!todayIso) return "";
    const lines = readiness?.lines ?? [];
    let s = todayIso;
    for (const l of lines) {
      const d =
        l.mode === "preorder" || !windowDays
          ? l.readyBy
          : nextHandoffIso(l.readyBy, windowDays) ?? l.readyBy;
      if (d > s) s = d;
    }
    if (lines.length === 0 && windowDays) s = nextHandoffIso(s, windowDays) ?? s;
    return s;
  })();

  // Plain server-action form: clicking Pay calls startCheckout directly (React
  // handles the submit). Guest sign-in now happens server-side, so there's no
  // client-side auth step that can hang.
  return (
    <>
      <CartSync onReadiness={setReadiness} />
      <form
        action={startCheckout}
        onSubmit={() =>
          track("checkout_started", {
            items: cart.items.length,
            subtotal_cents: subtotalCents,
            cook_slug: cart.cook.slug,
          })
        }
        className="mt-6 space-y-6"
      >
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

      <Field label="Your name">
        <input
          name="contact_name"
          defaultValue={defaultName}
          placeholder="Jane Doe"
          className={INPUT}
        />
      </Field>

      <Field label="Email for your receipt and order updates">
        <input
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
          placeholder="you@example.com"
          className={INPUT}
        />
      </Field>

      <Field label="Phone so the kitchen can reach you about this order">
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
        <p className="text-sm font-medium text-ink">Pickup or delivery?</p>
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
        <>
          {windows.length > 0 ? (
            // The cook set their pickup schedule — buyers choose a window
            // instead of proposing a time the cook never agreed to.
            <Field label="Pickup time">
              <select
                name="pickup_time"
                className={INPUT}
                value={pickupTime}
                onChange={(e) => setPickupChoice(e.target.value)}
              >
                {windows.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
                <option value="">Another time (I&apos;ll arrange it with the kitchen)</option>
              </select>
              <p className="mt-1 text-xs text-faint">
                We&apos;ll email you the pickup address after you pay.
              </p>
            </Field>
          ) : (
            <Field label="Preferred pickup time (optional)">
              <input
                name="pickup_time"
                placeholder="e.g. Saturday afternoon"
                className={INPUT}
              />
              <p className="mt-1 text-xs text-faint">
                We&apos;ll email you the pickup address after you pay.
              </p>
            </Field>
          )}
          {readiness === null ? (
            // Don't offer dates until the live check settles — a date chosen
            // now could silently vanish when the lead-time floor lands.
            <p className="text-xs text-faint">Checking availability&hellip;</p>
          ) : pickupTime && pickupDates.length > 0 ? (
            // The window's days are known: offer only dates it actually runs,
            // from the cart's lead-time floor forward. Keyed on the window so
            // switching Sat→Sun resets the choice instead of keeping a Saturday.
            <Field label="Pickup date">
              <select
                key={pickupTime}
                name="event_date"
                className={INPUT}
                defaultValue=""
              >
                <option value="">
                  Soonest available{soonest ? ` (${formatDateShort(soonest)})` : ""}
                </option>
                {pickupDates.map((d) => (
                  <option key={d} value={d}>
                    {formatDateShort(d)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-faint">
                Ordering ahead for a party or a holiday? Pick the day &mdash; your
                confirmation will show it.
              </p>
            </Field>
          ) : (
            <Field label="Pickup date (optional)">
              <input
                name="event_date"
                type="date"
                min={floor || undefined}
                max={dateMax || undefined}
                className={INPUT}
              />
              <p className="mt-1 text-xs text-faint">
                Ordering ahead for a party or a holiday? Pick the day &mdash; your
                confirmation will show it.
              </p>
            </Field>
          )}
        </>
      ) : (
        <>
          <Field label="Delivery address">
            <input
              name="delivery_address"
              required
              placeholder="123 Main St, Sunnyvale"
              className={INPUT}
            />
          </Field>
          <Field label="When is it for? (event date, optional)">
            <input
              name="event_date"
              type="date"
              min={floor || undefined}
              max={dateMax || undefined}
              className={INPUT}
            />
            <p className="mt-1 text-xs text-faint">
              Ordering for a party or gathering? Tell the kitchen the actual
              date so they plan for it — confirmations will show this date.
            </p>
          </Field>
        </>
      )}

      <Field label="Note for the kitchen (optional)">
        <textarea
          name="notes"
          rows={2}
          placeholder="Allergies, gate code, anything they should know"
          className={INPUT}
        />
      </Field>

      <div className="space-y-2 rounded-xl bg-card p-4 text-sm shadow-soft">
        <Row
          label="Subtotal (the chef receives this)"
          value={formatUsd(subtotalCents)}
        />
        <Row label="Service fee (8% + $0.30)" value={formatUsd(fee)} />
        <div className="border-t border-line pt-2">
          <Row label="Total" value={formatUsd(total)} bold />
        </div>
        <p className="text-xs text-faint">
          Prices include any California sales tax.
        </p>
      </div>

      <SubmitButton total={total} />
      <p className="text-center text-xs text-faint">
        Every ForkFork kitchen is checked against Santa Clara County&rsquo;s
        list of approved home cooks and bakers before it can sell.
      </p>
      <p className="text-center text-xs text-faint">
        No account needed. Pay as a guest, with secure payment by Stripe.
      </p>
      <p className="text-center text-xs text-faint">
        By placing an order you agree to the{" "}
        <a href="/terms" className="underline hover:text-ink">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/refunds" className="underline hover:text-ink">
          Refund Policy
        </a>
        .
      </p>
      </form>
    </>
  );
}

function SubmitButton({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90 disabled:opacity-60"
    >
      {pending ? "Taking you to payment…" : `Pay ${formatUsd(total)}`}
    </button>
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
