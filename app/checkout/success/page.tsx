import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { retrieveSession } from "@/lib/stripe";
import { confirmPaidOrder } from "@/lib/orders";
import { pickupLocation } from "@/lib/handoff";
import { formatUsd } from "@/lib/constants";
import ClearCart from "@/components/clear-cart";
import ClaimAccount from "@/components/claim-account";
import FollowToggle from "@/components/follow-toggle";

export const dynamic = "force-dynamic";
// Defense-in-depth: don't leak the session_id in the URL to any subresource via
// the Referer header.
export const metadata: Metadata = { referrer: "no-referrer" };

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id;
  if (!sessionId) {
    return (
      <Fallback
        title="No order found"
        body="We couldn't find a checkout session to confirm."
      />
    );
  }

  const session = await retrieveSession(sessionId);
  if (!session) {
    return (
      <Fallback
        title="Couldn't verify payment"
        body="If you were charged, don't worry — reach out and we'll sort it out."
      />
    );
  }

  const paid = session.payment_status === "paid";
  const orderId = session.metadata?.order_id;
  const admin = createAdminClient();

  // Confirm + deduct stock. Idempotent and shared with the Stripe webhook, so
  // whichever fires first wins and the other is a no-op.
  if (paid && orderId) {
    await confirmPaidOrder(orderId, session.payment_intent);
  }

  if (!paid) {
    return (
      <Fallback
        title="Payment not completed"
        body="Your card wasn't charged and your items are still in your cart."
      />
    );
  }

  const { data: order } = orderId
    ? await admin
        .from("orders")
        .select(
          "id, buyer_id, fulfillment, total_cents, pickup_time, delivery_address, cook_id, contact_email, order_items(title, quantity, line_total_cents)"
        )
        .eq("id", orderId)
        .maybeSingle()
    : { data: null as any };

  // The viewer must OWN this order before we reveal any of its PII — the buyer's
  // contact/delivery address and the cook's private home pickup address all sit
  // behind this check (the order is loaded via the service role, which bypasses
  // RLS, so ownership must be enforced here in code). Guest checkout runs on an
  // anonymous session, so the guest's own anon id equals order.buyer_id — one
  // check covers guests and signed-in buyers alike. Anyone else holding the
  // session_id URL (a forwarded or shared link) gets only a generic
  // confirmation. The payment was already confirmed above (keyed on the paid
  // Stripe session, not the viewer), so nothing is lost by hiding the details.
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const isOwner = Boolean(user && order && user.id === order.buyer_id);

  if (!isOwner) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <div className="rise rounded-2xl bg-card p-8 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
            ✓
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink">
            Order confirmed
          </h1>
          <p className="mt-2 text-muted">
            Your payment went through and the kitchen has your order.
          </p>
          <div className="mt-8">
            <Link
              href="/browse"
              className="inline-block rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
            >
              Browse more kitchens
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Owner-only from here — safe to load and reveal the handoff details.
  const isGuest = Boolean(user?.is_anonymous);
  let kitchenName = "";
  let pickupAddress: string | null = null;
  if (order.cook_id) {
    const { data: cook } = await admin
      .from("cooks")
      .select("business_name, city")
      .eq("id", order.cook_id)
      .maybeSingle();
    kitchenName = cook?.business_name ?? "";
    if (order.fulfillment === "pickup") {
      const { data: priv } = await admin
        .from("cook_private")
        .select("street_address, pickup_location")
        .eq("cook_id", order.cook_id)
        .maybeSingle();
      // Cook-chosen spot wins; else the private home address (post-order).
      pickupAddress = pickupLocation(
        priv?.street_address,
        cook?.city,
        priv?.pickup_location
      );
    }
  }

  // The moment a buyer most wants to hear from this kitchen again is right
  // after ordering — offer a follow (signed-in accounts only; a guest sees
  // the claim-account block below instead).
  let showFollow = false;
  if (user && !isGuest && order.cook_id) {
    const { data: f } = await sb
      .from("follows")
      .select("id")
      .eq("profile_id", user.id)
      .eq("cook_id", order.cook_id)
      .maybeSingle();
    showFollow = !f;
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <ClearCart />
      <div className="rise rounded-2xl bg-card p-8 text-center shadow-soft">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-ink">Order confirmed</h1>
        <p className="mt-2 text-muted">
          You paid {order ? formatUsd(order.total_cents) : "your order"}.{" "}
          {kitchenName || "The kitchen"} has your order and your contact details.
        </p>

        {order && (
          <div className="mt-6 space-y-2 rounded-xl bg-bg p-4 text-left text-sm">
            {(order.order_items ?? []).map((it: any, i: number) => (
              <div key={i} className="flex justify-between gap-4">
                <span className="text-ink">
                  {it.quantity}× {it.title}
                </span>
                <span className="text-muted">
                  {formatUsd(it.line_total_cents)}
                </span>
              </div>
            ))}
            <div className="mt-2 space-y-1 border-t border-line pt-2">
              {order.fulfillment === "delivery" ? (
                <p className="text-ink">
                  <span className="text-faint">Delivering to: </span>
                  {order.delivery_address}
                </p>
              ) : (
                <>
                  <p className="text-ink">
                    <span className="text-faint">Pickup: </span>
                    {pickupAddress ?? "The kitchen will message you the pickup address."}
                  </p>
                  {order.pickup_time && (
                    <p className="text-ink">
                      <span className="text-faint">When: </span>
                      {order.pickup_time}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {isGuest && <ClaimAccount defaultEmail={order?.contact_email ?? ""} />}

        {showFollow && (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-xl bg-bg p-4">
            <p className="text-sm text-ink">
              Love {kitchenName || "this kitchen"}? Get an email when they post
              something new.
            </p>
            {/* Client-side toggle on purpose: a server action would re-render
                this page and re-verify the Stripe session — a transient
                Stripe failure would swap the confirmed screen for the
                couldn't-verify fallback. */}
            <FollowToggle cookId={order.cook_id} />
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/browse"
            className="inline-block rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
          >
            Browse more kitchens
          </Link>
          {!isGuest && (
            <Link
              href="/orders"
              className="inline-block rounded-full border border-line px-6 py-3 font-medium text-ink hover:bg-bg"
            >
              See your purchases
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function Fallback({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-muted">{body}</p>
      <Link href="/cart" className="mt-6 inline-block text-brand hover:underline">
        ← Back to cart
      </Link>
    </main>
  );
}
