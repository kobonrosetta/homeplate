"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { calcServiceFeeCents } from "@/lib/constants";
import { createCheckoutSession } from "@/lib/stripe";
import {
  deriveUnitPrice,
  type OptionGroupRow,
  type OptionRow,
} from "@/lib/options";

// priceCents/title are what the buyer's cart DISPLAYED — used only to detect
// drift against the authoritative DB prices, never to price the order.
// optionIds are the buyer's item-option choices; their price effect is
// re-derived server-side from listing_options, never trusted.
type CartLine = {
  listingId: string;
  quantity: number;
  priceCents?: number;
  title?: string;
  optionIds?: string[];
};

export async function startCheckout(formData: FormData) {
  const supabase = createClient();
  // Resolve the buyer. Guests have no account yet — create an anonymous one here
  // on the server instead of in the browser (the old client-side auth step could
  // deadlock and freeze checkout). Signed-in users pass straight through.
  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();
  let user = existingUser;
  if (!user) {
    const { data: anon, error: anonErr } =
      await supabase.auth.signInAnonymously();
    if (anonErr || !anon.user) {
      redirect(
        `/checkout?error=${encodeURIComponent(
          "Couldn't start checkout — please try again."
        )}`
      );
    }
    user = anon.user;
  }

  const cookId = String(formData.get("cook_id") ?? "");
  let requested: CartLine[] = [];
  try {
    requested = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    requested = [];
  }
  const fulfillment =
    String(formData.get("fulfillment") ?? "pickup") === "delivery"
      ? "delivery"
      : "pickup";
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const contactEmail = String(formData.get("email") ?? "").trim();
  // Capped: windows are ≤80 chars, and free-text must not be a novel.
  const pickupTime = String(formData.get("pickup_time") ?? "")
    .trim()
    .slice(0, 120);
  const deliveryAddress = String(formData.get("delivery_address") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const err = (to: string, msg: string) =>
    redirect(`${to}?error=${encodeURIComponent(msg)}`);

  if (!cookId || requested.length === 0) err("/cart", "Your cart is empty.");
  if (!contactEmail) err("/checkout", "An email is required.");
  if (!contactPhone) err("/checkout", "A phone number is required.");
  if (fulfillment === "delivery" && !deliveryAddress)
    err("/checkout", "A delivery address is required.");

  // Authoritative prices — re-read from the DB, never trust the client.
  const ids = requested.map((r) => r.listingId);
  const { data: listings } = await supabase
    .from("listings")
    .select(
      "id, title, price_cents, cook_id, is_available, limited_quantity, quantity_available, served_hot"
    )
    .in("id", ids);

  const rows = (listings ?? []).filter(
    (l) => l.is_available && l.cook_id === cookId
  );

  // Never charge for a different cart than the buyer approved: if anything
  // they're looking at has since vanished or changed price, bounce back to the
  // cart (which re-syncs itself against live listings) instead of proceeding.
  const rowById = new Map(rows.map((l) => [l.id, l]));
  const gone = requested.filter((r) => !rowById.has(r.listingId));
  if (gone.length > 0) {
    const names = gone.map((g) => g.title?.trim() || "an item").join(", ");
    err("/cart", `No longer available: ${names}. We've updated your cart.`);
  }
  // Item options: re-derive each line's real unit price from the DB (base +
  // chosen option deltas). The client's optionIds pick WHICH options; the
  // price always comes from listing_options rows.
  const { data: groupRows } = await supabase
    .from("listing_option_groups")
    .select("id, listing_id")
    .in("listing_id", ids);
  const groups = (groupRows ?? []) as OptionGroupRow[];
  const { data: optionRows } = groups.length
    ? await supabase
        .from("listing_options")
        .select("id, group_id, name, price_delta_cents")
        .in(
          "group_id",
          groups.map((g) => g.id)
        )
    : { data: [] as OptionRow[] };
  const options = (optionRows ?? []) as OptionRow[];

  type PricedLine = CartLine & {
    unitPriceCents: number;
    titleSnapshot: string;
  };
  const priced: PricedLine[] = [];
  for (const r of requested) {
    const row = rowById.get(r.listingId)!;
    const derived = deriveUnitPrice(
      row.price_cents,
      r.listingId,
      groups,
      options,
      r.optionIds ?? []
    );
    if ("error" in derived) err("/cart", derived.error);
    const d = derived as Exclude<typeof derived, { error: string }>;
    priced.push({
      ...r,
      unitPriceCents: d.unitPriceCents,
      titleSnapshot: d.optionNames.length
        ? `${row.title} (${d.optionNames.join(", ")})`
        : row.title,
    });
  }

  const drifted = priced.some(
    (r) =>
      typeof r.priceCents === "number" && r.unitPriceCents !== r.priceCents
  );
  if (drifted) {
    err(
      "/cart",
      "Prices changed since you added these items — your cart has been updated, please review it."
    );
  }

  const { data: cook } = await supabase
    .from("cooks")
    .select("id, status, delivery_available, pickup_windows")
    .eq("id", cookId)
    .maybeSingle();
  if (!cook || cook.status !== "active")
    err("/cart", "This kitchen isn't available right now.");
  if (fulfillment === "delivery" && !cook!.delivery_available)
    err("/checkout", "This kitchen doesn't offer delivery.");
  // The cook owns the schedule: when they define pickup windows, a pickup
  // order must name one of the CURRENT windows (or none — the "arrange with
  // the kitchen" choice). Catches stale carts offering a deleted window and
  // devtools-fabricated values alike; the checkout page's CartSync will have
  // healed the cart by the time the buyer sees this bounce.
  const windows = (cook!.pickup_windows ?? []) as string[];
  if (
    fulfillment === "pickup" &&
    pickupTime &&
    windows.length > 0 &&
    !windows.includes(pickupTime)
  ) {
    err(
      "/checkout",
      "That pickup time isn't offered by this kitchen anymore — please choose one of their current times."
    );
  }

  // One order line per CART line (the same listing can appear twice with
  // different option choices). served_hot is snapshotted like title/price:
  // the cook's quarterly tax numbers must not change when a listing is
  // later edited or deleted.
  const items = priced.map((r) => {
    const qty = Math.max(1, Math.floor(r.quantity || 1));
    return {
      listing_id: r.listingId,
      title: r.titleSnapshot,
      unit_price_cents: r.unitPriceCents,
      quantity: qty,
      line_total_cents: r.unitPriceCents * qty,
      served_hot: !!rowById.get(r.listingId)?.served_hot,
    };
  });
  // Stock guard for limited items — total quantity per LISTING across lines.
  const qtyByListing = new Map<string, number>();
  for (const i of items) {
    qtyByListing.set(
      i.listing_id,
      (qtyByListing.get(i.listing_id) ?? 0) + i.quantity
    );
  }
  const short = rows.find(
    (l) =>
      l.limited_quantity &&
      (l.quantity_available ?? 0) < (qtyByListing.get(l.id) ?? 0)
  );
  if (short) {
    err(
      "/checkout",
      `"${short.title}" just sold out or doesn't have that many left — please update your cart.`
    );
  }

  const subtotal = items.reduce((n, i) => n + i.line_total_cents, 0);
  const fee = calcServiceFeeCents(subtotal);
  const total = subtotal + fee;

  // Create the order in a pending (unpaid) state. The buyer's own RLS policy
  // allows inserting an order + items for themselves.
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      buyer_id: user.id,
      cook_id: cookId,
      status: "pending",
      fulfillment,
      subtotal_cents: subtotal,
      service_fee_cents: fee,
      total_cents: total,
      pickup_time: fulfillment === "pickup" ? pickupTime || null : null,
      delivery_address: fulfillment === "delivery" ? deliveryAddress : null,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      contact_email: contactEmail || null,
      notes: notes || null,
    })
    .select("id")
    .single();
  if (orderErr || !order)
    err("/checkout", orderErr?.message ?? "Could not start your order.");

  const { error: itemsErr } = await supabase
    .from("order_items")
    .insert(items.map((i) => ({ order_id: order!.id, ...i })));
  if (itemsErr) err("/checkout", itemsErr.message);

  const h = headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const lineItems = [
    ...items.map((i) => ({
      name: i.title,
      amountCents: i.unit_price_cents,
      quantity: i.quantity,
    })),
    { name: "ForkFork service fee", amountCents: fee, quantity: 1 },
  ];

  let session: { id: string; url: string };
  try {
    session = await createCheckoutSession({
      lineItems,
      successUrl: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/cart`,
      metadata: { order_id: order!.id },
      customerEmail: contactEmail || user.email || undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payment could not be started.";
    redirect(`/checkout?error=${encodeURIComponent(msg)}`);
  }

  redirect(session.url);
}
