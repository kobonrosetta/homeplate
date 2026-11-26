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
import {
  isMissingHoldColumn,
  REFUND_CLAIM_STALE_MINUTES,
} from "@/lib/refund-hold";

type Db = ReturnType<typeof createAdminClient>;

// How long to wait before the one in-line second try at Stripe.
const UNCERTAIN_RETRY_MS = 1500;

export type MoneyMoveFailure = {
  ok: false;
  /** Full wording, for an admin or a log. Cook-facing screens map `reason`
   *  to their own copy instead (see app/dashboard/orders/page.tsx). */
  error: string;
  reason:
    | "not_found"
    | "not_yours"
    | "already_refunded"
    | "never_paid"
    | "not_cancelled"
    | "not_held"
    | "not_due"
    | "busy"
    | "db_error"
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

// The hold columns arrive with migration 45, which is pasted in by hand and
// may land before OR after this code deploys. Until it has, everything here
// falls back to the behavior from before the hold existed, so no refund path
// ever breaks on the ordering. isMissingHoldColumn is deliberately narrow:
// any OTHER database error fails closed.

/**
 * What the hold columns say about an order, read tolerantly:
 *   active   migration 45 is applied AND its trigger stamped a cancel time —
 *            the only state in which "the refund goes out by itself" is true
 *   claimed  a refund attempt has started (so the order can't be put back)
 * Without the columns both are false.
 */
export async function readRefundHold(
  orderId: string
): Promise<{ active: boolean; cancelledAt: string | null; claimed: boolean }> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("cancelled_at, refund_claimed_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data)
    return { active: false, cancelledAt: null, claimed: false };
  const row = data as {
    cancelled_at?: string | null;
    refund_claimed_at?: string | null;
  };
  const cancelledAt = row.cancelled_at ?? null;
  return {
    active: Boolean(cancelledAt),
    cancelledAt,
    claimed: Boolean(row.refund_claimed_at),
  };
}

type Claim =
  | { kind: "claimed"; at: string }
  | { kind: "busy" }
  | { kind: "unsupported" }
  | { kind: "error" };

// Take the order's refund claim, so that for the next few minutes this is the
// only thing allowed to move its money — the undo below refuses a claimed
// order.
//   claimed      go ahead (`at` identifies OUR claim, for releasing it)
//   busy         nothing matched: a fresh claim exists, or the order changed
//   unsupported  migration 45 isn't applied; proceed the old way, unclaimed
//   error        the database didn't answer properly; do NOT proceed
async function claimRefund(
  db: Db,
  orderId: string,
  opts: { cancelledOnly: boolean; holdOverBefore?: string }
): Promise<Claim> {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const stale = new Date(
    now - REFUND_CLAIM_STALE_MINUTES * 60_000
  ).toISOString();
  // Two plain compare-and-set writes instead of one OR filter: first an
  // unclaimed order, then one whose claim was abandoned.
  for (const takeOver of [false, true]) {
    let q = db
      .from("orders")
      .update({ refund_claimed_at: at })
      .eq("id", orderId)
      .is("refunded_at", null);
    if (opts.cancelledOnly) q = q.eq("status", "cancelled");
    if (takeOver) {
      q = q.lt("refund_claimed_at", stale);
    } else {
      q = q.is("refund_claimed_at", null);
      // The sweep's own guard, re-checked at the moment of claiming: the
      // hold must STILL be over. If the cook put the order back and
      // cancelled it again while the sweep was busy, this no longer matches.
      if (opts.holdOverBefore) q = q.lte("cancelled_at", opts.holdOverBefore);
    }
    const { data, error } = await q.select("id");
    if (error) {
      if (isMissingHoldColumn(error)) return { kind: "unsupported" };
      console.error("claimRefund: write failed", orderId, error);
      return { kind: "error" };
    }
    if (data && data.length > 0) return { kind: "claimed", at };
  }
  return { kind: "busy" };
}

// After an attempt that did not refund. `release` gives the claim back (Stripe
// clearly said no, so the money has not moved and an undo is safe again);
// without it the claim is kept (we can't tell what Stripe did). Either way
// the failure time is recorded so the sweep backs off. Only OUR claim is
// touched — if another attempt has since taken over, this matches nothing.
async function recordFailedAttempt(
  db: Db,
  orderId: string,
  claimedAt: string,
  release: boolean
): Promise<void> {
  const patch: Record<string, string | null> = {
    refund_failed_at: new Date().toISOString(),
  };
  if (release) patch.refund_claimed_at = null;
  const { error } = await db
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("refund_claimed_at", claimedAt)
    .is("refunded_at", null);
  if (error) console.error("recordFailedAttempt: write failed", orderId, error);
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
 *   cookId          when given, the order must belong to this kitchen
 *   cancelledOnly   refuse anything that isn't a cancelled order (the cook's
 *                   button and the sweep's expired holds; the admin may
 *                   refund any paid order)
 *   heldOnly        refuse an order the hold doesn't cover — one with no
 *                   database-stamped cancel time. The cook's button sets
 *                   this: cooks act only on cancels made under the hold,
 *                   never on older rows whose history we can't vouch for.
 *   holdOverBefore  (the sweep) only claim an unclaimed order whose cancel
 *                   time is at or before this instant — the "hold is over"
 *                   check, repeated atomically at claim time
 *
 * Order of operations — each step is the guard for the next:
 *   1. claim the order (compare-and-set), so an "undo cancel" can't slip in
 *      while Stripe is working;
 *   2. ask Stripe (createRefund always reverses the cook's transfer and
 *      returns the service fee; the idempotency key is the order id);
 *   3. record it: refunded_at, and — in the SAME write — 'cancelled' for an
 *      order that was still un-fulfilled, so an order is never left
 *      "refunded but active";
 *   4. restock if that write cancelled it;
 *   5. tell the buyer.
 * If Stripe clearly said no, the claim is released and nothing changed. If we
 * can't tell what Stripe did, the claim is KEPT: the order can't be put back,
 * and the next attempt (a button press, or the sweep) replays the same
 * request and settles it.
 */
export async function refundOrderNow(
  orderId: string,
  opts: {
    cookId?: string;
    cancelledOnly?: boolean;
    heldOnly?: boolean;
    holdOverBefore?: string;
  } = {}
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
  if (opts.heldOnly && !(await readRefundHold(order.id)).active)
    return fail(
      "not_held",
      "This order's refund isn't managed from the kitchen's dashboard."
    );

  // From here on, the row's own id — never the caller's spelling of it — so
  // every attempt for an order shares one Stripe idempotency key.
  const id = order.id as string;

  const claim = await claimRefund(db, id, {
    cancelledOnly: Boolean(opts.cancelledOnly),
    holdOverBefore: opts.holdOverBefore,
  });
  if (claim.kind === "error")
    return fail(
      "db_error",
      "Couldn't start the refund (database error). Please try again."
    );
  if (claim.kind === "busy") {
    // Nothing matched. Say which of the reasons it was.
    const { data: latest } = await db
      .from("orders")
      .select("status, refunded_at, refund_claimed_at")
      .eq("id", id)
      .maybeSingle();
    const row = latest as {
      status?: string;
      refunded_at?: string | null;
      refund_claimed_at?: string | null;
    } | null;
    if (row?.refunded_at)
      return fail("already_refunded", "This order was already refunded.");
    if (opts.cancelledOnly && row && row.status !== "cancelled")
      return fail(
        "not_cancelled",
        "This order is no longer cancelled, so there is nothing to refund here."
      );
    if (opts.holdOverBefore && row && !row.refund_claimed_at)
      return fail("not_due", "This order's hold is not over.");
    return fail(
      "busy",
      "A refund for this order is already being sent. Check again in a few minutes."
    );
  }

  // What we can honestly promise about an attempt that doesn't finish: with a
  // claim in place the sweep will pick it up (any order, cancelled or not);
  // without one (migration 45 not applied) nothing will.
  const retryNote =
    claim.kind === "claimed"
      ? "It will be retried automatically."
      : "Press Refund again in a few minutes (it can't refund twice).";

  // Idempotency-Key = order id: a lost response on a succeeded refund replays
  // Stripe's success on retry instead of erroring forever (see createRefund).
  let result = await createRefund(
    order.stripe_payment_intent_id as string,
    id
  );
  if ("error" in result && result.uncertain) {
    // Most "no answer" results are a momentary hiccup. Ask once more, same
    // key, before leaving this order to the sweep's slower retry.
    await new Promise((resolve) => setTimeout(resolve, UNCERTAIN_RETRY_MS));
    result = await createRefund(order.stripe_payment_intent_id as string, id);
  }
  // "Already refunded" means the buyer has the money (an earlier attempt we
  // never recorded, or a refund made in the Stripe dashboard): record it.
  if ("error" in result && result.code !== "charge_already_refunded") {
    if (result.uncertain) {
      // Recording the failure makes the sweep wait REFUND_RETRY_HOURS before
      // its next try. That matters here: Stripe replays a stored 5xx for the
      // same idempotency key for up to a day, so retrying every run would
      // only repeat the same answer (and the same admin email).
      if (claim.kind === "claimed")
        await recordFailedAttempt(db, id, claim.at, false);
      return fail(
        "uncertain",
        `Stripe didn't answer, so we can't tell yet whether the refund went through. ${retryNote} Don't refund it by hand in Stripe.`
      );
    }
    if (claim.kind === "claimed")
      await recordFailedAttempt(db, id, claim.at, true);
    return fail("stripe", "Refund failed: " + result.error);
  }

  // The money has left. Record it — this is the critical marker (it blocks a
  // double refund) — and, in the SAME write, cancel an order that was still
  // un-fulfilled. One statement, so a crash or a failed second write can
  // never leave an order refunded yet still active on the cook's list. The
  // status precondition keeps a concurrent 'completed' (the cook handed it
  // over mid-refund) from being flipped to cancelled.
  const refundedAt = new Date().toISOString();
  const { data: cancelledNow, error: cancelErr } = await db
    .from("orders")
    .update({ refunded_at: refundedAt, status: "cancelled" })
    .eq("id", id)
    .in("status", ["confirmed", "in_progress", "ready"])
    .select("id");
  const cancelledByThis =
    !cancelErr && Boolean(cancelledNow && cancelledNow.length > 0);
  let recordErr = cancelErr;
  if (!cancelErr && !cancelledByThis) {
    // Already cancelled (the cook's cancel, restocked then) or completed
    // (history stays): just the marker.
    const { error } = await db
      .from("orders")
      .update({ refunded_at: refundedAt })
      .eq("id", id);
    recordErr = error;
  }
  if (recordErr) {
    // The claim stays, so nobody can put the order back; the next attempt
    // replays the refund at Stripe (same key, or "already refunded" once the
    // key has expired) and lands here again.
    console.error("refundOrderNow: refunded but not recorded", id, recordErr);
    return fail(
      "not_recorded",
      `The refund was sent, but saving that failed. ${retryNote} Don't refund it by hand in Stripe.`
    );
  }

  // Restock only when this write is what cancelled the order
  // (restockOrderItems' documented contract: once per real cancellation).
  if (cancelledByThis) await restockOrderItems(id);

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
 *
 *   heldOnly  refuse an order the hold doesn't cover (no database-stamped
 *             cancel time) — set by the cook's button, see refundOrderNow.
 */
export async function reinstateCancelledOrder(
  orderId: string,
  opts: { cookId: string; heldOnly?: boolean }
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
  if (opts.heldOnly && !(await readRefundHold(order.id)).active)
    return fail(
      "not_held",
      "This order can't be put back from the kitchen's dashboard."
    );
  const id = order.id as string;

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
      .eq("id", id)
      .eq("status", "cancelled")
      .is("refunded_at", null);
    if (withClaimGuard) q = q.is("refund_claimed_at", null);
    return q.select("id");
  };
  let { data: flipped, error: flipErr } = await flip(true);
  // ONLY when the claim column provably doesn't exist (migration 45 not
  // applied — so no refund path claims either) is the pre-hold guard the
  // whole guard. Any other error must not drop the claim check.
  if (flipErr && isMissingHoldColumn(flipErr)) {
    ({ data: flipped, error: flipErr } = await flip(false));
  }
  if (flipErr) {
    console.error("reinstateCancelledOrder: write failed", id, flipErr);
    return fail(
      "db_error",
      "Couldn't put the order back (database error). Please try again."
    );
  }
  if (!flipped || flipped.length === 0)
    return fail(
      "changed",
      "This order can't be put back: it just changed, or its refund has already started. Refresh and check again."
    );

  // Re-take the limited stock the cancellation put back on the shelf.
  await deductOrderItems(id);

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
