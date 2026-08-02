import { verifyStripeSignature, retrieveAccount } from "@/lib/stripe";
import { confirmPaidOrder } from "@/lib/orders";
import { syncCookStripeStatus } from "@/lib/connect";

export const dynamic = "force-dynamic";

// Stripe -> here. The source of truth for "was this paid" (independent of
// whether the buyer's browser ever reaches /checkout/success) AND for each
// cook's Connect onboarding status.
//
// A Stripe webhook endpoint delivers EITHER platform events OR connected-account
// events, never both — so the dashboard registers TWO endpoints at this one URL:
//   1. "Events on your account"       -> checkout.session.completed
//      (secret: STRIPE_WEBHOOK_SECRET)
//   2. "Events on Connected accounts" -> account.updated,
//      account.application.deauthorized   (secret: STRIPE_CONNECT_WEBHOOK_SECRET)
// Each delivery is signed with its own endpoint's secret; accept if either
// verifies.
export async function POST(req: Request) {
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ].filter((s): s is string => !!s);
  if (secrets.length === 0) {
    // Not configured yet — refuse rather than trust an unsigned event.
    return new Response("Webhook not configured", { status: 500 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!secrets.some((s) => verifyStripeSignature(rawBody, sig, s))) {
    return new Response("Invalid signature", { status: 400 });
  }

  // `account` is the connected-account id present on Connect-endpoint events.
  let event: {
    type?: string;
    account?: string;
    livemode?: boolean;
    data?: { object?: any };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  // Mode fence: only act on events whose live/test mode matches our secret key.
  // Guards the cutover window where a test endpoint (or a leaked test signing
  // secret) could otherwise drive real order confirmations. Ack with 200 so
  // Stripe doesn't retry what we'll never process.
  const keyIsLive = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live");
  if (typeof event.livemode === "boolean" && event.livemode !== keyIsLive) {
    return new Response("ok (mode mismatch ignored)", { status: 200 });
  }

  // async_payment_succeeded is belt-and-braces: sessions are pinned to card
  // (which settles synchronously), but if a delayed method ever slips in, its
  // late success still confirms the order via the same idempotent path.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data?.object ?? {};
    if (session.payment_status === "paid" && session.metadata?.order_id) {
      const pi =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
      try {
        await confirmPaidOrder(session.metadata.order_id, pi);
      } catch {
        // Confirmation write failed (DB hiccup): 5xx so Stripe redelivers —
        // a 200 here would strand a PAID order in 'pending' forever.
        return new Response("Confirm failed", { status: 500 });
      }
    }
  }

  // A cook's Express onboarding/capabilities changed. Stripe doesn't guarantee
  // event ORDER, so never write the event's snapshot — re-fetch the account live
  // and write that (the id from the signature-verified event is trustworthy; only
  // its state may be stale). metadata.cook_id backstops the row match in case the
  // event beat startStripeOnboarding's row write. A failed sync returns 5xx so
  // Stripe redelivers on its retry schedule.
  if (event.type === "account.updated") {
    const account = event.data?.object ?? {};
    if (account.id) {
      const live = await retrieveAccount(account.id);
      // Transient fetch failure -> 500 so Stripe redelivers. But a DEFINITIVE
      // 403/404 ("gone" — deleted account / access revoked) can never succeed
      // on retry: clean up like a deauthorization and ack, instead of feeding
      // a 3-day retry storm.
      if (!live) return new Response("Account fetch failed", { status: 500 });
      try {
        if (live === "gone") {
          await syncCookStripeStatus(
            account.id,
            {
              transfersActive: false,
              payoutsEnabled: false,
              detailsSubmitted: false,
              disabledReason: "account_unreachable",
            },
            { clearAccountId: true }
          );
        } else {
          await syncCookStripeStatus(account.id, live, {
            cookIdHint: account.metadata?.cook_id ?? null,
          });
        }
      } catch {
        return new Response("Sync failed", { status: 500 });
      }
    }
  }

  // The cook disconnected the platform — pull them out of "ready" immediately.
  // data.object is the application here, so the account id is on event.account.
  // We can no longer read the account (access revoked), so write the zeroed state
  // directly and CLEAR the stored account id — otherwise "Set up payouts" would
  // retry the dead account forever instead of minting a fresh one.
  if (event.type === "account.application.deauthorized" && event.account) {
    try {
      await syncCookStripeStatus(
        event.account,
        {
          transfersActive: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          disabledReason: "deauthorized",
        },
        { clearAccountId: true }
      );
    } catch {
      return new Response("Sync failed", { status: 500 });
    }
  }

  return new Response("ok", { status: 200 });
}
