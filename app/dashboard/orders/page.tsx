import Link from "next/link";
import { getCurrentCook } from "@/lib/cook";
import { createClient } from "@/lib/supabase/server";
import {
  formatUsd,
  formatPhone,
  REFUND_HOLD_HOURS,
  SITE_URL,
} from "@/lib/constants";
import { formatDateLong, pacificTodayIso } from "@/lib/availability";
import {
  formatHoldTime,
  refundDueAt,
  refundState,
  type RefundState,
} from "@/lib/refund-hold";
import {
  advanceOrder,
  refundCancelledOrder,
  undoCancelOrder,
} from "./actions";
import ConfirmSubmit from "@/components/confirm-submit";
import { cancelPaymentRequest } from "./request-actions";
import ShareLink from "@/components/share-link";
import StatusPill from "@/components/status-pill";
import { orderStatusColor } from "@/lib/order-status";
import EmptyState from "@/components/empty-state";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "New · paid", cls: "bg-amber-100 text-amber-900" },
  in_progress: { label: "In progress", cls: "bg-indigo-100 text-indigo-900" },
  ready: { label: "Ready", cls: "bg-blue-100 text-blue-900" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-800" },
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { created?: string; refund?: string; refund_error?: string };
}) {
  const { cook } = await getCurrentCook();
  const supabase = createClient();

  // Open payment links (custom orders awaiting payment).
  const { data: requests } = await supabase
    .from("custom_requests")
    .select("id, token, title, price_cents, full_price_cents, charge_kind, status, expires_at, created_at")
    .eq("cook_id", cook!.id)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const openRequests = (requests ?? []).filter(
    (r: any) => new Date(r.expires_at) > new Date()
  );
  const justCreated = searchParams.created
    ? openRequests.find((r: any) => r.token === searchParams.created)
    : null;
  const siteUrl = SITE_URL;

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, status, fulfillment, subtotal_cents, service_fee_cents, total_cents, pickup_time, ready_by_date, event_date, notes, contact_name, contact_phone, delivery_address, created_at, custom_request_id, refunded_at, stripe_payment_intent_id, order_items(title, quantity, unit_price_cents, line_total_cents)"
    )
    .eq("cook_id", cook!.id)
    .neq("status", "pending")
    .order("created_at", { ascending: false });

  // The refund-hold columns (cancelled_at, refund_claimed_at) arrive with
  // migration 45, which is pasted in by hand and can land before OR after
  // this code. They get their OWN query so this page can never go blank over
  // a missing column: no columns means no hold, and the page behaves exactly
  // as it did before (a cancelled order is refunded by an admin).
  const { data: holdRows, error: holdError } = await supabase
    .from("orders")
    .select("id, cancelled_at, refund_claimed_at")
    .eq("cook_id", cook!.id)
    .eq("status", "cancelled");
  const holdOn = !holdError;
  const holdById = new Map<string, any>(
    (holdRows ?? []).map((r: any) => [r.id, r])
  );
  const nowMs = Date.now();

  const list = (orders ?? []).map((o: any) => ({
    ...o,
    ...(holdById.get(o.id) ?? {}),
  }));
  const active = list.filter((o: any) =>
    ["confirmed", "in_progress", "ready"].includes(o.status)
  );
  // Cancelled orders whose money hasn't gone back yet get their own block at
  // the top: they are the only finished orders with something left to decide
  // (undo the cancel, or send the refund before the hold runs out).
  const refundPending: any[] = holdOn
    ? list.filter((o: any) =>
        ["held", "sending", "stalled"].includes(refundState(o, nowMs))
      )
    : [];
  const pendingIds = new Set(refundPending.map((o: any) => o.id));
  const past = list.filter(
    (o: any) =>
      (o.status === "completed" || o.status === "cancelled") &&
      !pendingIds.has(o.id)
  );
  // Active orders read as a prep calendar: soonest handoff first (the
  // buyer-chosen date wins over the computed ready-by, as on every other
  // surface), grouped under day headers, date-less pay-link orders last.
  const todayIso = pacificTodayIso();
  const handoffOf = (o: any): string | null =>
    (o.event_date ?? o.ready_by_date ?? null) as string | null;
  const activeByDay: { key: string; label: string; orders: any[] }[] = [];
  for (const o of [...active].sort((a: any, b: any) => {
    const da = handoffOf(a) ?? "9999-12-31";
    const db = handoffOf(b) ?? "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  })) {
    const key = handoffOf(o) ?? "none";
    const last = activeByDay[activeByDay.length - 1];
    if (last && last.key === key) last.orders.push(o);
    else
      activeByDay.push({
        key,
        // "Earlier", not "overdue": ready_by_date is an estimate, and a
        // past-dated active order is as likely handed off and never marked
        // completed as it is missed. Payment-link orders carry their date
        // only as the cook's own text, shown on the card.
        label:
          key === "none"
            ? o.custom_request_id
              ? "Payment-link orders · date is on each order"
              : "Date to be arranged"
            : key === todayIso
              ? `Today · ${formatDateLong(key)}`
              : key < todayIso
                ? `Earlier · ${formatDateLong(key)}`
                : formatDateLong(key),
        orders: [o],
      });
  }

  const requestsUi = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">Orders customers placed with your kitchen.</p>
        <Link
          href="/dashboard/orders/request"
          className="rounded-full border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10"
        >
          + New payment request
        </Link>
      </div>

      {justCreated && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            ✓ Link ready. Send it to your buyer
          </p>
          <div className="mt-2">
            <ShareLink url={`${siteUrl}/pay/${justCreated.token}`} showUrl label="Copy link" />
          </div>
          <p className="mt-2 text-xs text-emerald-800">
            {justCreated.title} · you receive {formatUsd(justCreated.price_cents)} ·
            the buyer pays the service fee · expires in 7 days
          </p>
        </div>
      )}

      {openRequests.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
            Awaiting payment
          </h3>
          <div className="mt-3 space-y-3">
            {openRequests.map((r: any) => (
              <div key={r.id} className="rounded-xl bg-card p-4 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{r.title}</p>
                    <p className="text-sm text-muted">
                      {formatUsd(r.price_cents)}
                      {r.charge_kind === "deposit" && r.full_price_cents
                        ? ` deposit (of ${formatUsd(r.full_price_cents)})`
                        : ""}{" "}
                      · expires{" "}
                      {new Date(r.expires_at).toLocaleDateString("en-US", {
                        timeZone: "America/Los_Angeles",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <form action={cancelPaymentRequest}>
                    <input type="hidden" name="request_id" value={r.id} />
                    <button className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                      Cancel link
                    </button>
                  </form>
                </div>
                <div className="mt-2">
                  <ShareLink url={`${siteUrl}/pay/${r.token}`} showUrl label="Copy link" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );

  if (list.length === 0) {
    // Lead with the empty state; the payment-request creator (requestsUi) is
    // a secondary tool a brand-new cook hasn't been introduced to yet.
    return (
      <div className="space-y-8">
        <EmptyState
          title="No orders yet"
          subtitle="The moment a buyer pays, their order shows up here: what they bought, their pickup time or delivery address, and how to reach them."
        />
        {requestsUi}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {searchParams.refund === "sent" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="font-medium">Refund sent.</span> The buyer has been
          emailed, and the money should show on their card within a few
          business days.
        </p>
      )}
      {searchParams.refund === "undone" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="font-medium">The order is back on.</span> The buyer
          has been emailed that it&apos;s active again. No refund was sent.
        </p>
      )}
      {searchParams.refund_error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {searchParams.refund_error.slice(0, 300)}
        </p>
      )}
      {requestsUi}
      {refundPending.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
            Cancelled · refund not sent yet
          </h3>
          <div className="mt-3 space-y-4">
            {refundPending.map((o: any) => (
              <OrderCard
                key={o.id}
                o={o}
                hold={refundState(o, nowMs)}
                nowMs={nowMs}
              />
            ))}
          </div>
        </section>
      )}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
          Active
        </h3>
        {active.length === 0 ? (
          <div className="mt-2"><EmptyState title="Nothing to prepare right now" /></div>
        ) : (
          <div className="mt-3 space-y-6">
            {activeByDay.map((g) => (
              <div key={g.key}>
                <p
                  className={`mb-2 text-sm font-semibold ${
                    g.key !== "none" && g.key < todayIso ? "text-muted" : "text-ink"
                  }`}
                >
                  {g.label}
                  <span className="ml-2 font-normal text-faint">
                    {g.orders.length} {g.orders.length === 1 ? "order" : "orders"}
                  </span>
                </p>
                <div className="space-y-4">
                  {g.orders.map((o: any) => (
                    <OrderCard key={o.id} o={o} active holdOn={holdOn} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
            Past orders
          </h3>
          <div className="mt-3 space-y-4">
            {past.map((o: any) => (
              <OrderCard key={o.id} o={o} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OrderCard({
  o,
  active,
  hold,
  holdOn,
  nowMs,
}: {
  o: any;
  active?: boolean;
  /** Set for a cancelled order whose refund hasn't gone out (see
      lib/refund-hold.ts): the card grows the undo / refund-now controls. */
  hold?: RefundState;
  /** Is the refund hold set up (migration 45)? Changes what Cancel promises. */
  holdOn?: boolean;
  nowMs?: number;
}) {
  const s = STATUS[o.status] ?? STATUS.confirmed;
  const buyer = o.contact_name || "the buyer";
  const dueIso = hold ? refundDueAt(o.cancelled_at) : null;
  const dueLabel = dueIso ? formatHoldTime(dueIso) : null;
  const overdue = Boolean(
    dueIso && nowMs !== undefined && Date.parse(dueIso) <= nowMs
  );
  // Pacific explicitly: the server's process TZ is UTC on Render, and this
  // sits right under Pacific day headers.
  const date = new Date(o.created_at).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className={`rounded-xl bg-card p-5 shadow-soft ${
        active || hold ? "" : "opacity-70"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">
            #{String(o.id).slice(0, 8)}
          </span>
          <StatusPill label={s.label} className={orderStatusColor(o.status)} />
        </div>
        <span className="text-sm text-muted">{date}</span>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-ink">
        {(o.order_items ?? []).map((it: any, idx: number) => (
          <li key={idx} className="flex justify-between gap-4">
            <span>
              {it.quantity}× {it.title}
            </span>
            <span className="text-muted">{formatUsd(it.line_total_cents)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-3 rounded-lg bg-card p-3 text-sm sm:grid-cols-2">
        {(o.event_date ?? o.ready_by_date) && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-faint">
              For
            </p>
            <p className="mt-0.5 font-medium text-ink">
              {formatDateLong(o.event_date ?? o.ready_by_date)}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-faint">
            {o.fulfillment === "delivery" ? "Deliver to" : "Pickup"}
          </p>
          <p className="mt-0.5 text-ink">
            {o.fulfillment === "delivery"
              ? o.delivery_address || "—"
              : o.pickup_time || "Time to be arranged"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-faint">
            Contact
          </p>
          <p className="mt-0.5 text-ink">
            {o.contact_name || "Buyer"}
            {o.contact_phone ? ` · ${formatPhone(o.contact_phone)}` : ""}
          </p>
        </div>
      </div>

      {o.notes && (
        <p className="mt-3 text-sm text-muted">
          <span className="font-medium text-ink">Note:</span> {o.notes}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-sm text-muted">
          Buyer paid {formatUsd(o.total_cents)} · service fee{" "}
          {formatUsd(o.service_fee_cents)}
        </span>
        {/* A cancelled order pays nothing: don't promise money right above
            the line that says it's going back to the buyer. */}
        <span className="font-semibold text-ink">
          {o.status === "cancelled"
            ? "You would have received"
            : "You receive"}{" "}
          {formatUsd(o.subtotal_cents)}
        </span>
      </div>

      {/* Where a cancelled order's money stands, once it's settled or when
          the hold isn't available (then an admin still sends refunds). */}
      {!hold && o.status === "cancelled" && o.refunded_at && (
        <p className="mt-3 text-sm text-muted">
          ✓ Refunded{" "}
          {new Date(o.refunded_at).toLocaleDateString("en-US", {
            timeZone: "America/Los_Angeles",
            month: "short",
            day: "numeric",
          })}
        </p>
      )}
      {!hold &&
        o.status === "cancelled" &&
        !o.refunded_at &&
        o.stripe_payment_intent_id && (
          <p className="mt-3 text-sm text-muted">
            Refund not sent yet. ForkFork is handling it.
          </p>
        )}

      {hold && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          {hold === "sending" ? (
            <p className="text-sm text-amber-900">
              The refund is being sent. Check back in a few minutes.
            </p>
          ) : (
            <>
              <p className="text-sm text-amber-900">
                {hold === "stalled" ? (
                  <>
                    A refund was started for this order but didn&apos;t finish.
                    It will be retried automatically, or you can send it again
                    now.
                  </>
                ) : overdue || !dueLabel ? (
                  <>
                    The {formatUsd(o.total_cents)} refund hasn&apos;t gone out
                    yet.{" "}
                    {dueLabel
                      ? "It goes out on the next automatic run, usually within a few hours."
                      : "Send it now, or undo the cancel."}
                  </>
                ) : (
                  <>
                    The {formatUsd(o.total_cents)} refund goes back to {buyer}{" "}
                    automatically on <strong>{dueLabel}</strong>.
                  </>
                )}
              </p>
              {hold === "held" && (
                <p className="mt-1 text-xs text-amber-800">
                  Cancelled by mistake? Undo puts the order back on and tells
                  the buyer.
                </p>
              )}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {hold === "held" && (
                  <form action={undoCancelOrder}>
                    <input type="hidden" name="order_id" value={o.id} />
                    <ConfirmSubmit
                      message={`Put ${buyer}'s ${formatUsd(
                        o.total_cents
                      )} order back on?\n\nIt returns to your active orders and they're emailed that it's on again. No refund is sent.`}
                      className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-bg"
                    >
                      Undo cancel
                    </ConfirmSubmit>
                  </form>
                )}
                <form action={refundCancelledOrder}>
                  <input type="hidden" name="order_id" value={o.id} />
                  <ConfirmSubmit
                    message={`Send ${buyer}'s ${formatUsd(
                      o.total_cents
                    )} refund now?\n\nThe full amount goes back to their card, and this order can no longer be put back. This can't be undone.`}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
                  >
                    {hold === "stalled" ? "Send refund again" : "Refund now"}
                  </ConfirmSubmit>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {active && (
        <form
          action={advanceOrder}
          className="mt-4 flex flex-wrap justify-end gap-2"
        >
          <input type="hidden" name="order_id" value={o.id} />
          {/* Cancelling is the one destructive button here: it emails the buyer
              at once (a $340 fat-finger taught us, Oct 2026), so it alone gets
              a confirm dialog. With the refund hold set up, the cancel can
              still be undone for REFUND_HOLD_HOURS; without it there is no
              undo from this dashboard, and the dialog says whichever is
              true. */}
          <ConfirmSubmit
            name="status"
            value="cancelled"
            message={`Cancel this ${formatUsd(o.total_cents)} order${
              o.contact_name ? ` from ${o.contact_name}` : ""
            }?\n\n${
              holdOn
                ? `The buyer is emailed right away. Their refund goes out automatically in ${REFUND_HOLD_HOURS} hours. Until then you can undo the cancel, or send the refund sooner, from this page.`
                : "The buyer is immediately emailed that the order is cancelled and their payment is being refunded. This can't be undone from your dashboard — if you cancel by mistake, contact ForkFork right away."
            }`}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Cancel order
          </ConfirmSubmit>
          {o.status === "confirmed" && (
            <button
              name="status"
              value="in_progress"
              className="rounded-full border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10"
            >
              I&apos;m on it
            </button>
          )}
          {(o.status === "confirmed" || o.status === "in_progress") && (
            <button
              name="status"
              value="ready"
              className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-card"
            >
              Mark ready
            </button>
          )}
          <button
            name="status"
            value="completed"
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
          >
            Mark completed
          </button>
        </form>
      )}
    </div>
  );
}
