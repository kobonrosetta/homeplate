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
//   refund_failed_at   when the last refund attempt did not succeed; the sweep
//                      waits REFUND_RETRY_HOURS before trying that order again
//   refunded_at        (migration 40) the money has been sent back
import { REFUND_HOLD_HOURS } from "@/lib/constants";

/**
 * A refund attempt that has held its claim longer than this did not finish
 * (crash, lost connection). The next attempt may take the claim over — safe,
 * because every attempt for an order uses the same Stripe idempotency key and
 * the Stripe call itself is bounded at 30 seconds.
 */
export const REFUND_CLAIM_STALE_MINUTES = 10;

/**
 * After a refund attempt fails, the sweep leaves that order alone for this
 * long. Without it a refund Stripe keeps refusing (a disputed charge, say)
 * would be retried — and the admins emailed — on every run, forever.
 */
export const REFUND_RETRY_HOURS = 12;

/** The fields of an order row the hold rules read. */
export type RefundHoldOrder = {
  status?: string | null;
  stripe_payment_intent_id?: string | null;
  refunded_at?: string | null;
  cancelled_at?: string | null;
  refund_claimed_at?: string | null;
  refund_failed_at?: string | null;
};

/**
 * Where an order's refund stands:
 *  - "none"      nothing to refund here: unpaid, or not cancelled and no
 *                refund ever started
 *  - "held"      cancelled, money still in place, no refund started: it can
 *                be undone or refunded
 *  - "sending"   a refund attempt holds a fresh claim; wait for it
 *  - "stalled"   a refund attempt started and never finished; it may be
 *                retried, but the order can no longer be put back
 *  - "refunded"  the money has been sent back
 * "sending" and "stalled" apply to ANY paid order, cancelled or not: the
 * admin can refund an order that is still active, and that attempt can stall
 * like any other.
 */
export type RefundState = "none" | "held" | "sending" | "stalled" | "refunded";

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function refundState(o: RefundHoldOrder, nowMs: number): RefundState {
  if (o.refunded_at) return "refunded";
  if (!o.stripe_payment_intent_id) return "none";
  if (o.refund_claimed_at) {
    // A claim we can't read as a time is still a claim: never "held".
    const claimed = ms(o.refund_claimed_at);
    return claimed !== null &&
      nowMs - claimed < REFUND_CLAIM_STALE_MINUTES * 60_000
      ? "sending"
      : "stalled";
  }
  return o.status === "cancelled" ? "held" : "none";
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
 *  - Not while a refund is in flight, and not within REFUND_RETRY_HOURS of a
 *    failed attempt.
 *  - A held order: only once its hold is over, and only with a KNOWN cancel
 *    time — an order with no cancelled_at is never refunded automatically.
 *  - A stalled order: yes, whatever the hold says. Someone already chose to
 *    refund it and it can no longer be put back, so finishing is the only way
 *    out. */
export function isRefundDue(o: RefundHoldOrder, nowMs: number): boolean {
  const state = refundState(o, nowMs);
  if (state !== "held" && state !== "stalled") return false;
  const failed = ms(o.refund_failed_at);
  if (failed !== null && nowMs - failed < REFUND_RETRY_HOURS * 3_600_000)
    return false;
  if (state === "stalled") return true;
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

const HOLD_COLUMNS = ["cancelled_at", "refund_claimed_at", "refund_failed_at"];

/**
 * Is this database error "the hold columns aren't there" — i.e. migration 45
 * has not been applied? The code falls back to the pre-hold behavior ONLY on
 * this exact answer, so the test is deliberately narrow: Postgres' 42703 or
 * PostgREST's PGRST204, AND a message that names one of the hold columns.
 * Anything else (an outage, a timeout, a different missing column) is a real
 * error and must fail closed — treating it as "not migrated" would silently
 * drop the claim that keeps a refund and an undo from both winning.
 */
export function isMissingHoldColumn(
  err: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!err) return false;
  if (err.code !== "42703" && err.code !== "PGRST204") return false;
  const message = err.message ?? "";
  return HOLD_COLUMNS.some((column) => message.includes(column));
}

/** "Thu, Nov 26, 2:15 PM" in Pacific time — how a refund's due time is shown
 *  to the cook and in emails (the server's own clock runs in UTC). Newer
 *  runtimes put a narrow no-break space before AM/PM; plain spaces only, so
 *  the text is the same everywhere it's shown. */
export function formatHoldTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(/[  ]/g, " ");
}
