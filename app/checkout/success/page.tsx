import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { retrieveSession } from "@/lib/stripe";
import { confirmPaidOrder } from "@/lib/orders";
import { formatUsd } from "@/lib/constants";
import ClearCart from "@/components/clear-cart";
import ClaimAccount from "@/components/claim-account";

export const dynamic = "force-dynamic";

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
          "id, fulfillment, total_cents, pickup_time, delivery_address, cook_id, contact_email, order_items(title, quantity, line_total_cents)"
        )
        .eq("id", orderId)
        .maybeSingle()
    : { data: null as any };

  let kitchenName = "";
  let pickupAddress: string | null = null;
  if (order?.cook_id) {
    const { data: cook } = await admin
      .from("cooks")
      .select("business_name, city")
      .eq("id", order.cook_id)
      .maybeSingle();
    kitchenName = cook?.business_name ?? "";
    if (order.fulfillment === "pickup") {
      const { data: priv } = await admin
        .from("cook_private")
        .select("street_address")
        .eq("cook_id", order.cook_id)
        .maybeSingle();
      pickupAddress =
        [priv?.street_address, cook?.city].filter(Boolean).join(", ") || null;
    }
  }

  // A guest checkout leaves the buyer on an anonymous session — offer to turn it
  // into a real account so this order (and future ones) stays attached.
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const isGuest = Boolean(user?.is_anonymous);

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <ClearCart />
      <div className="rounded-2xl border border-line p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-ink">Order confirmed</h1>
        <p className="mt-2 text-muted">
          You paid {order ? formatUsd(order.total_cents) : "your order"}.{" "}
          {kitchenName || "The kitchen"} has your order and your contact details.
        </p>

        {order && (
          <div className="mt-6 space-y-2 rounded-xl border border-line p-4 text-left text-sm">
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
                    {pickupAddress ?? "The kitchen will share the address"}
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

        <Link
          href="/browse"
          className="mt-8 inline-block rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90"
        >
          Browse more kitchens
        </Link>
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
