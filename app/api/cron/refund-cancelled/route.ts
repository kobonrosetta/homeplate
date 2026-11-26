import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, notifyAdmins } from "@/lib/email";
import { formatUsd, REFUND_HOLD_HOURS } from "@/lib/constants";
import {
  isMissingHoldColumn,
  isRefundDue,
  refundState,
  REFUND_RETRY_HOURS,
} from "@/lib/refund-hold";
import { refundOrderNow } from "@/lib/refunds";

export const dynamic = "force-dynamic";

// Sends the refunds whose hold is over. A cook's cancel leaves the buyer's
// money in place for REFUND_HOLD_HOURS so a mistaken cancel can be undone;
// if the cook neither undoes it nor refunds sooner, this sweep sends the
// refund — nobody has to remember to click anything (before this, buyers
// waited up to a week on an admin click). It also finishes any refund that
// was started and never reported back, on ANY order: an admin's refund of a
// still-active order that timed out must not be left half-done.
//
// Hit on a schedule by the existing GitHub Actions workflows (a second step
// in order-reminders.yml and announce-dishes.yml) with
// Authorization: Bearer CRON_SECRET. Safe to call as often as you like and
// from overlapping runs: lib/refunds.ts refundOrderNow claims each order
// before asking Stripe, and every attempt for an order shares one Stripe
// idempotency key.
//
// What it will touch, and nothing else:
//   - a cancelled, paid, unrefunded order whose database-stamped cancel time
//     is older than the hold (an order with no cancel time is never refunded
//     automatically), and
//   - a paid, unrefunded order with a refund attempt that began more than
//     REFUND_CLAIM_STALE_MINUTES ago and never finished.
// Either is left alone for REFUND_RETRY_HOURS after a failed attempt.

// One run moves at most this many refunds. Far above pilot volume; the point
// is that an unattended job can never fan out without a person noticing.
const MAX_PER_RUN = 10;
// …and stops starting new ones after this long, so a slow Stripe can't hold
// the caller (curl gives up at 120s) while the rest wait for the next run.
const TIME_BUDGET_MS = 80_000;

const COLUMNS =
  "id, status, cook_id, total_cents, contact_name, stripe_payment_intent_id, refunded_at, cancelled_at, refund_claimed_at, refund_failed_at";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const startedAt = Date.now();
  const holdOver = new Date(
    startedAt - REFUND_HOLD_HOURS * 3_600_000
  ).toISOString();
  const unrefunded = () =>
    admin
      .from("orders")
      .select(COLUMNS)
      .is("refunded_at", null)
      .not("stripe_payment_intent_id", "is", null);

  // Two plain queries rather than one OR filter: cancelled orders whose hold
  // has run out, and refunds that were started on any order
  // (lib/refund-hold.ts decides which of those are stuck rather than still
  // in flight, and which are backing off after a failure).
  const [held, started] = await Promise.all([
    unrefunded()
      .eq("status", "cancelled")
      .lte("cancelled_at", holdOver)
      .order("cancelled_at", { ascending: true })
      .limit(50),
    unrefunded().not("refund_claimed_at", "is", null).limit(50),
  ]);
  const queryError = held.error ?? started.error;
  if (queryError) {
    // Migration 45 hasn't been pasted in yet: there is no hold, refunds are
    // still an admin click, and that is not this job's failure to report.
    // (Any OTHER error is: a database outage must not look like "nothing to
    // do".)
    if (isMissingHoldColumn(queryError)) {
      return NextResponse.json({
        skipped: "refund hold not set up (migration 45)",
      });
    }
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const byId = new Map<string, any>();
  for (const o of [...(held.data ?? []), ...(started.data ?? [])])
    byId.set(o.id, o);
  const due = [...byId.values()]
    .filter((o) => isRefundDue(o, startedAt))
    // Orders that have never failed go first, oldest cancel first, so one
    // refund Stripe keeps refusing can't crowd out the ones that will work.
    .sort((a, b) => {
      const failed = Number(Boolean(a.refund_failed_at)) - Number(Boolean(b.refund_failed_at));
      if (failed !== 0) return failed;
      return String(a.cancelled_at ?? "9999").localeCompare(String(b.cancelled_at ?? "9999"));
    });
  const batch = due.slice(0, MAX_PER_RUN);

  const refunded: any[] = [];
  const failed: { order: any; error: string }[] = [];
  let attempted = 0;
  for (const o of batch) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    attempted++;
    const result =
      refundState(o, startedAt) === "held"
        ? // An expired hold: still cancelled AND still expired, re-checked
          // in the same write that claims it.
          await refundOrderNow(o.id, {
            cancelledOnly: true,
            holdOverBefore: holdOver,
          })
        : // A stuck refund: someone already chose to refund this order.
          await refundOrderNow(o.id);
    if (result.ok) {
      refunded.push(o);
      continue;
    }
    // Lost a harmless race since the query ran: the cook refunded it, undid
    // the cancel (or undid and cancelled again), or another run is on it.
    if (
      result.reason === "already_refunded" ||
      result.reason === "not_cancelled" ||
      result.reason === "not_due" ||
      result.reason === "busy"
    )
      continue;
    failed.push({ order: o, error: result.error });
  }

  if (refunded.length > 0 || failed.length > 0) {
    const cookIds = [
      ...new Set(
        [...refunded, ...failed.map((f) => f.order)].map((o) => o.cook_id)
      ),
    ];
    const { data: cooks } = await admin
      .from("cooks")
      .select("id, business_name")
      .in("id", cookIds);
    const kitchen = (id: string) =>
      escapeHtml(
        cooks?.find((c: any) => c.id === id)?.business_name ?? "a kitchen"
      );
    const line = (o: any) =>
      `<strong>${escapeHtml(String(o.id))}</strong> · ${formatUsd(
        o.total_cents ?? 0
      )}${o.contact_name ? ` · ${escapeHtml(o.contact_name)}` : ""} · ${kitchen(
        o.cook_id
      )}`;
    const plural = (n: number) => (n === 1 ? "" : "s");
    await notifyAdmins(
      failed.length > 0
        ? `Refund FAILED for ${failed.length} order${plural(failed.length)}`
        : `Refunded automatically: ${refunded.length} order${plural(
            refunded.length
          )}`,
      `${
        failed.length > 0
          ? `<h2>These refunds did not go through</h2>
             <p>The buyers were told a refund was coming. Each is tried again
             about every ${REFUND_RETRY_HOURS} hours. To try sooner, or to
             read the full error, use the Refund button in the admin
             console.</p>
             <ul>${failed
               .map((f) => `<li>${line(f.order)}<br/>${escapeHtml(f.error)}</li>`)
               .join("")}</ul>
             <p style="color:#8a7f6f;font-size:13px">If a buyer was made whole
             another way (a bank dispute, for example) Stripe will keep
             refusing; these emails stop once <code>refunded_at</code> is set
             on that order in Supabase.</p>`
          : ""
      }${
        refunded.length > 0
          ? `<h2>${
              failed.length > 0 ? "Refunded on this run" : "No action needed"
            }</h2>
             <p>These were refunded by the scheduled run — a cancelled order
             whose ${REFUND_HOLD_HOURS}-hour hold ran out, or a refund that
             had been started and not finished. Transfer reversed, service
             fee returned, buyer emailed.</p>
             <ul>${refunded.map((o) => `<li>${line(o)}</li>`).join("")}</ul>`
          : ""
      }`
    );
  }

  return NextResponse.json({
    due: due.length,
    refunded: refunded.length,
    failed: failed.length,
    more: due.length > attempted,
  });
}
