"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { calcServiceFeeCents } from "@/lib/constants";
import { createCheckoutSession } from "@/lib/stripe";

type CartLine = { listingId: string; quantity: number };

export async function startCheckout(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
  const pickupTime = String(formData.get("pickup_time") ?? "").trim();
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
      "id, title, price_cents, cook_id, is_available, limited_quantity, quantity_available"
    )
    .in("id", ids);

  const rows = (listings ?? []).filter(
    (l) => l.is_available && l.cook_id === cookId
  );
  if (rows.length === 0)
    err("/cart", "These items are no longer available.");

  const { data: cook } = await supabase
    .from("cooks")
    .select("id, status, delivery_available")
    .eq("id", cookId)
    .maybeSingle();
  if (!cook || cook.status !== "active")
    err("/cart", "This kitchen isn't available right now.");
  if (fulfillment === "delivery" && !cook!.delivery_available)
    err("/checkout", "This kitchen doesn't offer delivery.");

  const qtyById = new Map(
    requested.map((r) => [r.listingId, Math.max(1, Math.floor(r.quantity || 1))])
  );
  const items = rows.map((l) => {
    const qty = qtyById.get(l.id) ?? 1;
    return {
      listing_id: l.id,
      title: l.title,
      unit_price_cents: l.price_cents,
      quantity: qty,
      line_total_cents: l.price_cents * qty,
    };
  });
  // Stock guard for limited items — don't let a buyer pay for what isn't there.
  const short = rows.find((l) => {
    const qty = qtyById.get(l.id) ?? 1;
    return l.limited_quantity && (l.quantity_available ?? 0) < qty;
  });
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
    { name: "HomePlate service fee", amountCents: fee, quantity: 1 },
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
