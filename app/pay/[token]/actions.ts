"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcServiceFeeCents } from "@/lib/constants";
import { createCheckoutSession } from "@/lib/stripe";

// Pay a cook-minted payment request. Mirrors startCheckout: anonymous guest
// session, order born 'pending' with amounts that sum (RLS-enforced), Stripe
// hosted checkout, and the shared idempotent confirm on success. The amount
// comes from the request row the COOK created — the buyer's browser sends
// only the token and contact details.
export async function payLinkCheckout(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const err = (msg: string) =>
    redirect(`/pay/${token}?error=${encodeURIComponent(msg)}`);

  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const contactEmail = String(formData.get("email") ?? "").trim();
  if (!contactEmail) err("An email is required.");
  if (!contactPhone) err("A phone number is required.");

  // The token is the capability — resolve it server-side only.
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("custom_requests")
    .select(
      "id, cook_id, title, price_cents, full_price_cents, charge_kind, pickup_date, status, expires_at"
    )
    .eq("token", token)
    .maybeSingle();
  if (!request) redirect("/");
  if (request.status !== "open" || new Date(request.expires_at) < new Date()) {
    err("This payment link is no longer active — ask the kitchen for a new one.");
  }

  const { data: cook } = await admin
    .from("cooks")
    .select("id, status, stripe_ready, business_name")
    .eq("id", request.cook_id)
    .maybeSingle();
  if (!cook || cook.status !== "active")
    err("This kitchen isn't taking payments right now.");
  // Payout backstop: cook must have finished Stripe onboarding. The connected
  // account id lives in the service-role-only cook_stripe table.
  if (!cook!.stripe_ready)
    err("This kitchen isn't taking payments right now.");
  const { data: cookStripe } = await admin
    .from("cook_stripe")
    .select("stripe_account_id")
    .eq("cook_id", request.cook_id)
    .maybeSingle();
  if (!cookStripe?.stripe_account_id)
    err("This kitchen isn't taking payments right now.");

  // Guest session (same pattern as startCheckout).
  const supabase = createClient();
  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();
  let user = existingUser;
  if (!user) {
    const { data: anon, error: anonErr } =
      await supabase.auth.signInAnonymously();
    if (anonErr || !anon.user) err("Couldn't start checkout — please try again.");
    user = anon!.user;
  }

  const subtotal = request.price_cents;
  const fee = calcServiceFeeCents(subtotal);
  const total = subtotal + fee;
  // Stripe rejects charges under $0.50 — guard tiny deposits before we create an
  // order we could never collect on.
  if (total < 50) err("This amount is too small to process.");
  const depositNote =
    request.charge_kind === "deposit" && request.full_price_cents
      ? ` (50% deposit of $${(request.full_price_cents / 100).toFixed(2)} total)`
      : "";

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      buyer_id: user!.id,
      cook_id: request.cook_id,
      status: "pending",
      fulfillment: "pickup",
      subtotal_cents: subtotal,
      service_fee_cents: fee,
      total_cents: total,
      pickup_time: request.pickup_date || null,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      contact_email: contactEmail || null,
      notes: `Custom order${depositNote}`,
      custom_request_id: request.id,
    })
    .select("id")
    .single();
  if (orderErr || !order) err("Could not start your order — please try again.");

  // Server-authored line item, written with the service role — buyers have no
  // order_items INSERT policy (see harden-order-items-server-authored.sql).
  const { error: itemErr } = await admin.from("order_items").insert({
    order_id: order!.id,
    listing_id: null,
    title: request.title + depositNote,
    unit_price_cents: subtotal,
    quantity: 1,
    line_total_cents: subtotal,
  });
  if (itemErr) err("Could not start your order — please try again.");

  const h = headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  let session: { id: string; url: string };
  try {
    session = await createCheckoutSession({
      lineItems: [
        { name: request.title + depositNote, amountCents: subtotal, quantity: 1 },
        { name: "ForkFork service fee", amountCents: fee, quantity: 1 },
      ],
      successUrl: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/pay/${token}`,
      metadata: { order_id: order!.id },
      customerEmail: contactEmail || undefined,
      // Destination charge: the cook receives the subtotal, ForkFork keeps the fee.
      applicationFeeCents: fee,
      destinationAccountId: cookStripe!.stripe_account_id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payment could not be started.";
    err(msg);
  }

  redirect(session!.url);
}
