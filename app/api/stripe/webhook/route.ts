import { verifyStripeSignature } from "@/lib/stripe";
import { confirmPaidOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Stripe -> here. The source of truth for "was this paid", independent of
// whether the buyer's browser ever reaches /checkout/success.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured yet — refuse rather than trust an unsigned event.
    return new Response("Webhook not configured", { status: 500 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!verifyStripeSignature(rawBody, sig, secret)) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: { type?: string; data?: { object?: any } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object ?? {};
    if (session.payment_status === "paid" && session.metadata?.order_id) {
      const pi =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
      await confirmPaidOrder(session.metadata.order_id, pi);
    }
  }

  return new Response("ok", { status: 200 });
}
