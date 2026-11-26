// The refund hold on a cook-cancelled order — pure rules, no I/O, unit-tested.
//
// When a cook cancels a paid order the money does not move yet. For
// REFUND_HOLD_HOURS the cook can undo the cancel (the order goes back on) or
// send the refund right away; after that the scheduled sweep
// (app/api/cron/refund-cancelled) sends it. Before this, the refund waited on
// an admin click — buyers waited up to a week (Nov 2026).
//
// Columns (migration 45, supabase/add-order-refund-hold.sql):
//   cancelled_at       stamped by a database trigger when status becomes
//                      'cancelled', cleared when the order is put back
//   refund_claimed_at  set by the server just before it asks Stripe for the
//                      refund, so a refund and an undo can never both win
//   refunded_at        (migration 40) the money has been sent back
import { REFUND_HOLD_HOURS } from "@/lib/constants";

/**
 * A refund attempt that has held its claim longer than this did not finish
 * (crash, lost connection). The next attempt may take the claim over — safe,
 * because every attempt for an order uses the same Stripe idempotency key.
 */
export const REFUND_CLAIM_STALE_MINUTES = 10;

/** The fields of an order row the hold rules read. */
export type RefundHoldOrder = {
  status?: string | null;
  stripe_payment_intent_id?: string | null;
  refunded_at?: string | null;
  cancelled_at?: string | null;
  refund_claimed_at?: string | null;
};

/**
 * Where a cancelled order's refund stands:
 *  - "none"      not a paid, cancelled order — nothing to refund here
 *  - "held"      cancelled, money still in place: can be undone or refunded
 *  - "sending"   a refund attempt holds a fresh claim; wait for it
 *  - "stalled"   a refund attempt started and never finished; it may be
 *                retried, but the order can no longer be put back
 *  - "refunded"  the money has been sent back
 */
export type RefundState = "none" | "held" | "sending" | "stalled" | "refunded";

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function refundState(o: RefundHoldOrder, nowMs: number): RefundState {
  if (o.refunded_at) return "refunded";
  if (o.status !== "cancelled" || !o.stripe_payment_intent_id) return "none";
  const claimed = ms(o.refund_claimed_at);
  if (claimed === null) return "held";
  return nowMs - claimed < REFUND_CLAIM_STALE_MINUTES * 60_000
    ? "sending"
    : "stalled";
}

/** When the hold ends and the refund goes out by itself (ISO), or null when
 *  the cancel time isn't known (an order cancelled before migration 45). */
export function refundDueAt(
  cancelledAt: string | null | undefined
): string | null {
  const t = ms(cancelledAt);
  if (t === null) return null;
  return new Date(t + REFUND_HOLD_HOURS * 3_600_000).toISOString();
}

/** Should the scheduled sweep refund this order now?
 *  - A held order: only once its hold is over, and only with a KNOWN cancel
 *    time — an order with no cancelled_at is never refunded automatically.
 *  - A stalled order: yes, whatever the clock says. Someone already chose to
 *    refund it and it can no longer be put back, so finishing is the only way
 *    out. */
export function isRefundDue(o: RefundHoldOrder, nowMs: number): boolean {
  const state = refundState(o, nowMs);
  if (state === "stalled") return true;
  if (state !== "held") return false;
  const due = ms(refundDueAt(o.cancelled_at));
  return due !== null && due <= nowMs;
}

/** May the order still be put back? Only while the money has provably not
 *  moved: cancelled, paid, unrefunded and no refund attempt ever started. */
export function canUndoCancel(o: RefundHoldOrder, nowMs: number): boolean {
  return refundState(o, nowMs) === "held";
}

/** May a refund be (re)started now? Yes while held, and again once a stuck
 *  attempt has gone stale — never while a fresh attempt is in flight. */
export function canRefundNow(o: RefundHoldOrder, nowMs: number): boolean {
  const state = refundState(o, nowMs);
  return state === "held" || state === "stalled";
}

/** "Thu, Nov 26, 2:15 PM" in Pacific time — how a refund's due time is shown
 *  to the cook and in emails (the server's own clock runs in UTC). */
export function formatHoldTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
