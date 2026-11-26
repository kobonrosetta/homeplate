import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, notifyAdmins } from "@/lib/email";
import { formatUsd, REFUND_HOLD_HOURS } from "@/lib/constants";
import { isRefundDue } from "@/lib/refund-hold";
import { isMissingColumn, refundOrderNow } from "@/lib/refunds";

export const dynamic = "force-dynamic";

// Sends the refunds whose hold is over. A cook's cancel leaves the buyer's
// money in place for REFUND_HOLD_HOURS so a mistaken cancel can be undone;
// if the cook neither undoes it nor refunds sooner, this sweep sends the
// refund — nobody has to remember to click anything (before this, buyers
// waited up to a week on an admin click). It also finishes any refund that
// was started and never reported back.
//
// Hit on a schedule by the existing GitHub Actions workflows (a second step
// in order-reminders.yml and announce-dishes.yml) with
// Authorization: Bearer CRON_SECRET. Safe to call as often as you like and
// from overlapping runs: lib/refunds.ts refundOrderNow claims each order
// before asking Stripe, and every attempt for an order shares one Stripe
// idempotency key.
//
// It only ever touches orders that are cancelled, paid, not yet refunded,
// AND carry a database-stamped cancel time older than the hold (or a refund
// attempt that already began). An order with no cancel time is never
// refunded automatically.

// One run moves at most this many refunds. Far above pilot volume; the point
// is that an unattended job can never fan out without a person noticing.
const MAX_PER_RUN = 10;

const COLUMNS =
  "id, status, cook_id, total_cents, contact_name, stripe_payment_intent_id, refunded_at, cancelled_at, refund_claimed_at";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const holdOver = new Date(now - REFUND_HOLD_HOURS * 3_600_000).toISOString();
  const candidates = () =>
    admin
      .from("orders")
      .select(COLUMNS)
      .eq("status", "cancelled")
      .is("refunded_at", null)
      .not("stripe_payment_intent_id", "is", null);

  // Two plain queries rather than one OR filter: holds that have run out, and
  // refunds that were started (lib/refund-hold.ts decides which of those are
  // stuck rather than still in flight).
  const [held, started] = await Promise.all([
    candidates()
      .lte("cancelled_at", holdOver)
      .order("cancelled_at", { ascending: true })
      .limit(50),
    candidates().not("refund_claimed_at", "is", null).limit(50),
  ]);
  const queryError = held.error ?? started.error;
  if (queryError) {
    // Migration 45 hasn't been pasted in yet: there is no hold, refunds are
    // still an admin click, and that is not this job's failure to report.
    if (isMissingColumn(queryError)) {
      return NextResponse.json({ skipped: "refund hold not set up (migration 45)" });
    }
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const byId = new Map<string, any>();
  for (const o of [...(held.data ?? []), ...(started.data ?? [])]) byId.set(o.id, o);
  const due = [...byId.values()].filter((o) => isRefundDue(o, now));
  const batch = due.slice(0, MAX_PER_RUN);

  const refunded: any[] = [];
  const failed: { order: any; error: string }[] = [];
  for (const o of batch) {
    const result = await refundOrderNow(o.id, { cancelledOnly: true });
    if (result.ok) {
      refunded.push(o);
      continue;
    }
    // Lost a harmless race since the query ran: the cook refunded it, undid
    // the cancel, or another run is on it. Nothing to report.
    if (
      result.reason === "already_refunded" ||
      result.reason === "not_cancelled" ||
      result.reason === "busy"
    )
      continue;
    failed.push({ order: o, error: result.error });
  }

  if (refunded.length > 0 || failed.length > 0) {
    const cookIds = [...new Set([...refunded, ...failed.map((f) => f.order)].map((o) => o.cook_id))];
    const { data: cooks } = await admin
      .from("cooks")
      .select("id, business_name")
      .in("id", cookIds);
    const kitchen = (id: string) =>
      escapeHtml(cooks?.find((c: any) => c.id === id)?.business_name ?? "a kitchen");
    const line = (o: any) =>
      `<strong>${escapeHtml(String(o.id))}</strong> · ${formatUsd(o.total_cents ?? 0)}${
        o.contact_name ? ` · ${escapeHtml(o.contact_name)}` : ""
      } · ${kitchen(o.cook_id)}`;
    await notifyAdmins(
      failed.length > 0
        ? `Refund FAILED for ${failed.length} cancelled order${failed.length === 1 ? "" : "s"}`
        : `Refunded automatically: ${refunded.length} cancelled order${refunded.length === 1 ? "" : "s"}`,
      `${
        failed.length > 0
          ? `<h2>These refunds did not go through</h2>
             <p>The buyers were told a refund was coming. Each one is retried
             on the next run; if it keeps failing, use the Refund button in
             the admin console and read the error there.</p>
             <ul>${failed
               .map((f) => `<li>${line(f.order)}<br/>${escapeHtml(f.error)}</li>`)
               .join("")}</ul>`
          : ""
      }${
        refunded.length > 0
          ? `<h2>${failed.length > 0 ? "Refunded on this run" : "No action needed"}</h2>
             <p>The ${REFUND_HOLD_HOURS}-hour hold after the kitchen's cancel
             ran out, so the refund went out by itself: transfer reversed,
             service fee returned, buyer emailed.</p>
             <ul>${refunded.map((o) => `<li>${line(o)}</li>`).join("")}</ul>`
          : ""
      }`
    );
  }

  return NextResponse.json({
    due: due.length,
    refunded: refunded.length,
    failed: failed.length,
    more: due.length > batch.length,
  });
}
