import { getCurrentCook } from "@/lib/cook";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/constants";
import { advanceOrder } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "New · paid", cls: "bg-amber-100 text-amber-900" },
  in_progress: { label: "In progress", cls: "bg-indigo-100 text-indigo-900" },
  ready: { label: "Ready for pickup", cls: "bg-blue-100 text-blue-900" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-800" },
};

export default async function OrdersPage() {
  const { cook } = await getCurrentCook();
  const supabase = createClient();

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

  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center">
        <p className="font-medium text-ink">No orders yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          The moment a buyer pays, their order shows up here — what they bought,
          their pickup time or delivery address, and how to reach them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-muted">Orders customers placed with your kitchen.</p>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
          Active
        </h3>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing to prepare right now.</p>
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
      className={`rounded-xl border border-line p-5 ${
        active ? "" : "opacity-70"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">
            #{String(o.id).slice(0, 8)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
          >
            {s.label}
          </span>
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
