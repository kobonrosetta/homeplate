import Link from "next/link";
import { getCurrentCook } from "@/lib/cook";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/constants";
import { advanceOrder } from "./actions";
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
  searchParams: { created?: string };
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, status, fulfillment, subtotal_cents, service_fee_cents, total_cents, pickup_time, notes, contact_name, contact_phone, delivery_address, created_at, order_items(title, quantity, unit_price_cents, line_total_cents)"
    )
    .eq("cook_id", cook!.id)
    .neq("status", "pending")
    .order("created_at", { ascending: false });

  const list = orders ?? [];
  const active = list.filter((o: any) =>
    ["confirmed", "in_progress", "ready"].includes(o.status)
  );
  const past = list.filter(
    (o: any) => o.status === "completed" || o.status === "cancelled"
  );

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
            ✓ Link ready — send it to your buyer
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
          subtitle="The moment a buyer pays, their order shows up here — what they bought, their pickup time or delivery address, and how to reach them."
        />
        {requestsUi}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {requestsUi}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
          Active
        </h3>
        {active.length === 0 ? (
          <div className="mt-2"><EmptyState title="Nothing to prepare right now." /></div>
        ) : (
          <div className="mt-3 space-y-4">
            {active.map((o: any) => (
              <OrderCard key={o.id} o={o} active />
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

function OrderCard({ o, active }: { o: any; active?: boolean }) {
  const s = STATUS[o.status] ?? STATUS.confirmed;
  const date = new Date(o.created_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className={`rounded-xl bg-card p-5 shadow-soft ${
        active ? "" : "opacity-70"
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
            {o.contact_phone ? ` · ${o.contact_phone}` : ""}
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
        <span className="font-semibold text-ink">
          You receive {formatUsd(o.subtotal_cents)}
        </span>
      </div>

      {active && (
        <form
          action={advanceOrder}
          className="mt-4 flex flex-wrap justify-end gap-2"
        >
          <input type="hidden" name="order_id" value={o.id} />
          <button
            name="status"
            value="cancelled"
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Cancel order
          </button>
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
