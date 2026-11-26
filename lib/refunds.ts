// Sending an order's money back, and putting a cancelled order back on — the
// two ways out of "cancelled, money still in place". ONE implementation of
// each, shared by the cook's dashboard, the admin console and the scheduled
// sweep, so the money rules can't drift between them. The pure hold rules
// (who may do what, and when) live in lib/refund-hold.ts.
//
// SERVER ONLY. Every write here uses the service role, so the caller must
// already have checked who is asking: the admin gate, the cron secret, or a
// cook session — whose kitchen id is passed in as `cookId` and re-checked
// against the order row below.
import { createAdminClient } from "@/lib/supabase/admin";
import { createRefund } from "@/lib/stripe";
import { restockOrderItems, deductOrderItems } from "@/lib/orders";
import { escapeHtml, sendEmail, wrapEmail } from "@/lib/email";
import { formatUsd, SUPPORT_EMAIL } from "@/lib/constants";
import { REFUND_CLAIM_STALE_MINUTES } from "@/lib/refund-hold";

type Db = ReturnType<typeof createAdminClient>;

export type MoneyMoveFailure = {
  ok: false;
  /** Safe to show to a cook or an admin. */
  error: string;
  reason:
    | "not_found"
    | "not_yours"
    | "already_refunded"
    | "never_paid"
    | "not_cancelled"
    | "busy"
    | "stripe"
    | "uncertain"
    | "not_recorded"
    | "changed";
};
/** What a caller needs to tell people about the order that just moved. */
export type MovedOrder = {
  id: string;
  totalCents: number;
  buyerName: string | null;
  cookId: string | null;
};
export type MoneyMoveResult = { ok: true; order: MovedOrder } | MoneyMoveFailure;

const moved = (order: {
  id: string;
  total_cents: number | null;
  contact_name: string | null;
  cook_id: string | null;
}): MovedOrder => ({
  id: order.id,
  totalCents: order.total_cents ?? 0,
  buyerName: order.contact_name ?? null,
  cookId: order.cook_id ?? null,
});

const fail = (
  reason: MoneyMoveFailure["reason"],
  error: string
): MoneyMoveFailure => ({ ok: false, reason, error });

// PostgREST's two ways of saying "that column isn't there": the hold columns
// arrive with migration 45, which is pasted in by hand and may land before OR
// after this code deploys. Until it has, everything here falls back to the
// behavior from before the hold existed, so no refund path ever breaks on
// the ordering.
export function isMissingColumn(
  err: { code?: string; message?: string } | null
): boolean {
  if (!err) return false;
  return (
    err.code === "42703" ||
    err.code === "PGRST204" ||
    /column .* does not exist|schema cache/i.test(err.message ?? "")
  );
}

/**
 * Does the refund hold exist for this order — i.e. has migration 45 been
 * applied AND did its trigger stamp the cancel time? Callers use this to
 * decide which emails are true: "the refund goes out by itself" is only a
 * promise we can make when this says so.
 */
export async function readRefundHold(
  orderId: string
): Promise<{ active: boolean; cancelledAt: string | null }> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("cancelled_at")
    .eq("id", orderId)
    .maybeSingle();
  const cancelledAt = error ? null : ((data as any)?.cancelled_at ?? null);
  return { active: Boolean(cancelledAt), cancelledAt };
}

// Take the order's refund claim, so that for the next few minutes this is the
// only thing allowed to move its money — the undo below refuses a claimed
// order. "claimed": go ahead. "busy": another attempt holds a fresh claim.
// "unsupported": migration 45 isn't applied; proceed the old way, unclaimed.
async function claimRefund(
  db: Db,
  orderId: string,
  cancelledOnly: boolean
): Promise<"claimed" | "busy" | "unsupported" | "error"> {
  const now = Date.now();
  const stale = new Date(now - REFUND_CLAIM_STALE_MINUTES * 60_000).toISOString();
  // Two plain compare-and-set writes instead of one OR filter: first an
  // unclaimed order, then one whose claim was abandoned.
  for (const takeOver of [false, true]) {
    let q = db
      .from("orders")
      .update({ refund_claimed_at: new Date(now).toISOString() })
      .eq("id", orderId)
      .is("refunded_at", null);
    if (cancelledOnly) q = q.eq("status", "cancelled");
    q = takeOver
      ? q.lt("refund_claimed_at", stale)
      : q.is("refund_claimed_at", null);
    const { data, error } = await q.select("id");
    if (error) {
      if (isMissingColumn(error)) return "unsupported";
      console.error("claimRefund: write failed", orderId, error);
      return "error";
    }
    if (data && data.length > 0) return "claimed";
  }
  return "busy";
}

async function releaseClaim(db: Db, orderId: string): Promise<void> {
  const { error } = await db
    .from("orders")
    .update({ refund_claimed_at: null })
    .eq("id", orderId)
    .is("refunded_at", null);
  if (error) console.error("releaseClaim: write failed", orderId, error);
}

async function kitchenName(db: Db, cookId: string | null): Promise<string> {
  if (!cookId) return "the kitchen";
  const { data } = await db
    .from("cooks")
    .select("business_name")
    .eq("id", cookId)
    .maybeSingle();
  return data?.business_name ?? "the kitchen";
}

/**
 * Refund a paid order in full, correctly, exactly once.
 *
 *   cookId         when given, the order must belong to this kitchen
 *   cancelledOnly  refuse anything that isn't a cancelled order (the cook's
 *                  button and the sweep; the admin may refund any paid order)
 *
 * Order of operations — each step is the guard for the next:
 *   1. claim the order (compare-and-set), so an "undo cancel" can't slip in
 *      while Stripe is working;
 *   2. ask Stripe (createRefund always reverses the cook's transfer and
 *      returns the service fee; the idempotency key is the order id);
 *   3. stamp refunded_at — only now is the order "refunded";
 *   4. cancel + restock if the order was still un-fulfilled;
 *   5. tell the buyer.
 * If Stripe clearly said no, the claim is released and nothing changed. If we
 * can't tell what Stripe did, the claim is KEPT: the order can't be put back,
 * and the next attempt (a button press, or the sweep) replays the same
 * request and settles it.
 */
export async function refundOrderNow(
  orderId: string,
  opts: { cookId?: string; cancelledOnly?: boolean } = {}
): Promise<MoneyMoveResult> {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, status, refunded_at, total_cents, stripe_payment_intent_id, contact_email, contact_name, cook_id"
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return fail("not_found", "Order not found.");
  if (opts.cookId && order.cook_id !== opts.cookId)
    return fail("not_yours", "Order does not belong to this kitchen.");
  if (order.refunded_at)
    return fail("already_refunded", "This order was already refunded.");
  if (!order.stripe_payment_intent_id)
    return fail(
      "never_paid",
      "No payment to refund (this order was never paid)."
    );
  if (opts.cancelledOnly && order.status !== "cancelled")
    return fail(
      "not_cancelled",
      "Only a cancelled order can be refunded from here."
    );

  // What happens to an attempt that doesn't finish: the sweep only watches
  // CANCELLED orders, so only those can honestly be promised a retry.
  const retryNote =
    order.status === "cancelled"
      ? "It will be retried automatically."
      : "Press Refund again in about ten minutes (it can't refund twice).";

  const claim = await claimRefund(db, orderId, Boolean(opts.cancelledOnly));
  if (claim === "busy")
    return fail(
      "busy",
      "A refund for this order is already being sent. Check again in a few minutes."
    );
  if (claim === "error")
    return fail("busy", "Couldn't start the refund. Please try again.");

  // Idempotency-Key = order id: a lost response on a succeeded refund replays
  // Stripe's success on retry instead of erroring forever (see createRefund).
  const result = await createRefund(
    order.stripe_payment_intent_id as string,
    orderId
  );
  // "Already refunded" means the buyer has the money (an earlier attempt we
  // never recorded, or a refund made in the Stripe dashboard): record it.
  if ("error" in result && result.code !== "charge_already_refunded") {
    if (result.uncertain) {
      return fail(
        "uncertain",
        `Stripe didn't answer, so we can't tell yet whether the refund went through. ${retryNote} Don't refund it by hand in Stripe.`
      );
    }
    if (claim === "claimed") await releaseClaim(db, orderId);
    return fail("stripe", "Refund failed: " + result.error);
  }

  // Record the refund FIRST and unconditionally — this is the critical marker
  // (blocks a double-refund; the money already left Stripe). Keep it separate
  // from the cancel so a status hiccup can't lose the refund record.
  const { error: stampErr } = await db
    .from("orders")
    .update({ refunded_at: new Date().toISOString() })
    .eq("id", orderId);
  if (stampErr) {
    // The claim stays, so nobody can put the order back; the next attempt
    // replays the refund at Stripe (same key, or "already refunded" once the
    // key has expired) and lands here again.
    console.error("refundOrderNow: refunded but not recorded", orderId, stampErr);
    return fail(
      "not_recorded",
      `The refund was sent, but saving that failed. ${retryNote} Don't refund it by hand in Stripe.`
    );
  }

  // Cancel + restock ONLY if the order is still un-fulfilled. Guard the write
  // with a status precondition and check it actually matched: a concurrent cook
  // 'completed' transition (mid-refund) must NOT be flipped to cancelled, and
  // its already-delivered stock must NOT be put back. Restock only when the
  // cancel truly persisted (restockOrderItems' documented contract). An order
  // the cook already cancelled matches nothing here — it was restocked then.
  const { data: cancelled } = await db
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .in("status", ["confirmed", "in_progress", "ready"])
    .select("id");
  if (cancelled && cancelled.length > 0) await restockOrderItems(orderId);

  // Tell the buyer their money's coming back. Best-effort: email must never
  // block or undo the refund record.
  if (order.contact_email) {
    try {
      const kitchen = await kitchenName(db, order.cook_id);
      await sendEmail({
        to: order.contact_email,
        subject: "Refunded: your ForkFork order",
        html: wrapEmail(
          `<h2>You've been refunded</h2>
           <p>Hi${
             order.contact_name ? ` ${escapeHtml(order.contact_name)}` : ""
           }, your ${formatUsd(order.total_cents ?? 0)} order at ${escapeHtml(
            kitchen
          )} has been fully refunded.</p>
           <p>It should land back on your original payment method within a few
           business days. Questions? Just reply, or email ${escapeHtml(
             SUPPORT_EMAIL
           )}.</p>`
        ),
      });
    } catch {
      /* best-effort */
    }
  }

  return { ok: true, order: moved(order) };
}

/**
 * Put a cancelled order back on (it returns to 'confirmed'). Only possible
 * while the money has provably not moved: status 'cancelled', never refunded,
 * and no refund attempt ever claimed it. The service role is exempt from the
 * status-transition trigger — this is the one sanctioned path out of
 * 'cancelled'. Re-takes any limited stock the cancellation put back and
 * emails the buyer that the order is on again: the cancellation email
 * promised them a refund, so staying silent would mean a no-show or a
 * chargeback.
 */
export async function reinstateCancelledOrder(
  orderId: string,
  opts: { cookId: string }
): Promise<MoneyMoveResult> {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, status, refunded_at, total_cents, stripe_payment_intent_id, contact_email, contact_name, fulfillment, cook_id"
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return fail("not_found", "Order not found.");
  if (order.cook_id !== opts.cookId)
    return fail("not_yours", "Order does not belong to this kitchen.");
  if (order.status !== "cancelled")
    return fail("not_cancelled", "Only a cancelled order can be reinstated.");
  if (order.refunded_at)
    return fail(
      "already_refunded",
      "This order was already refunded — the buyer's money is on its way back, so it can't be reinstated. Have them place a fresh order instead."
    );
  if (!order.stripe_payment_intent_id)
    return fail(
      "never_paid",
      "This order was never paid — nothing to reinstate."
    );

  // Guarded flip: only out of 'cancelled', and verify it actually matched so
  // a concurrent refund/reinstate can't double-apply the side effects below.
  // BOTH money guards are load-bearing IN the compare-and-set, not just in
  // the read above: refunded_at (the money left) and refund_claimed_at (a
  // refund is being sent right now, or one started and never reported back).
  // Without them, an undo racing the ~1-2s Stripe call would leave the buyer
  // refunded AND the cook fulfilling a free order.
  const flip = (withClaimGuard: boolean) => {
    let q = db
      .from("orders")
      .update({ status: "confirmed" })
      .eq("id", orderId)
      .eq("status", "cancelled")
      .is("refunded_at", null);
    if (withClaimGuard) q = q.is("refund_claimed_at", null);
    return q.select("id");
  };
  let { data: flipped, error: flipErr } = await flip(true);
  // Before migration 45 there is no claim column (and no refund path that
  // claims), so the pre-hold guard is the whole guard.
  if (flipErr && isMissingColumn(flipErr)) {
    ({ data: flipped, error: flipErr } = await flip(false));
  }
  if (flipErr) {
    console.error("reinstateCancelledOrder: write failed", orderId, flipErr);
    return fail("changed", "Couldn't put the order back. Please try again.");
  }
  if (!flipped || flipped.length === 0)
    return fail(
      "changed",
      "This order can't be put back: it just changed, or its refund has already started. Refresh and check again."
    );

  // Re-take the limited stock the cancellation put back on the shelf.
  await deductOrderItems(orderId);

  // Tell the buyer it's back on. Best-effort — the reinstate must stand even
  // if email fails (someone can always follow up by hand).
  if (order.contact_email) {
    try {
      const kitchen = await kitchenName(db, order.cook_id);
      await sendEmail({
        to: order.contact_email,
        subject: `Your order is back on: ${kitchen}`,
        html: wrapEmail(
          `<h2>Your order is back on</h2>
           <p>Hi${
             order.contact_name ? ` ${escapeHtml(order.contact_name)}` : ""
           } — good news: your ${formatUsd(
            order.total_cents ?? 0
          )} order at ${escapeHtml(
            kitchen
          )} was cancelled by mistake and has been fully reinstated. Your ${
            order.fulfillment === "delivery" ? "delivery" : "pickup"
          } is on as planned.</p>
           <p>Your original payment stands — no refund was issued and you will
           not be charged again. Please disregard the earlier cancellation
           email.</p>
           <p>Questions? Just reply, or email ${escapeHtml(SUPPORT_EMAIL)}.</p>`
        ),
      });
    } catch {
      /* best-effort */
    }
  }

  return { ok: true, order: moved(order) };
}
