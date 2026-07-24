import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { formatUsd } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const { cook } = await getCurrentCook();
  const supabase = createClient();

  const [{ data: listings }, { data: orders }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, is_available, limited_quantity, quantity_available")
      .eq("cook_id", cook.id),
    supabase.from("orders").select("status, subtotal_cents").eq("cook_id", cook.id),
  ]);

  const items = listings ?? [];
  const totalListings = items.length;
  const visible = items.filter((l: any) => l.is_available).length;
  const soldOut = items.filter(
    (l: any) =>
      l.is_available && l.limited_quantity && (l.quantity_available ?? 0) <= 0
  ).length;

  const ords = orders ?? [];
  const completed = ords.filter((o: any) => o.status === "completed");
  const earned = completed.reduce(
    (n: number, o: any) => n + (o.subtotal_cents ?? 0),
    0
  );
  const newOrders = ords.filter((o: any) => o.status === "confirmed").length;
  const inProgressOrders = ords.filter(
    (o: any) => o.status === "in_progress"
  ).length;
  const readyOrders = ords.filter((o: any) => o.status === "ready").length;

  // Prioritized — the order they're pushed is the order they're shown.
  const tasks: { label: string; href: string; urgent?: boolean }[] = [];
  if (newOrders > 0)
    tasks.push({
      label: `${newOrders} new ${
        newOrders === 1 ? "order" : "orders"
      } waiting — tap "I'm on it" so the buyer knows`,
      href: "/dashboard/orders",
      urgent: true,
    });
  if (inProgressOrders > 0)
    tasks.push({
      label: `${inProgressOrders} ${
        inProgressOrders === 1 ? "order" : "orders"
      } in progress`,
      href: "/dashboard/orders",
    });
  if (totalListings === 0)
    tasks.push({
      label: "Add your first dish to start selling",
      href: "/dashboard/listings/new",
      urgent: true,
    });
  if (readyOrders > 0)
    tasks.push({
      label: `${readyOrders} ${
        readyOrders === 1 ? "order is" : "orders are"
      } ready — waiting for pickup`,
      href: "/dashboard/orders",
    });
  if (soldOut > 0)
    tasks.push({
      label: `${soldOut} ${
        soldOut === 1 ? "item is" : "items are"
      } sold out — restock or switch to made-to-order`,
      href: "/dashboard/menu",
    });
  if (cook.status === "active" && totalListings > 0 && visible === 0)
    tasks.push({
      label: "None of your listings are visible to buyers",
      href: "/dashboard/menu",
    });

  return (
    <div className="space-y-6">
      {cook.status !== "active" && (
        <p className="rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand">
          Your kitchen is under review, so it isn&apos;t public yet. Go ahead and
          build your menu — it goes live the moment you&apos;re approved.
        </p>
      )}

      <div className="rounded-xl border border-line p-5">
        <p className="text-sm text-muted">Earned on completed orders</p>
        <p className="mt-1 text-3xl font-semibold text-ink">{formatUsd(earned)}</p>
        <p className="mt-1 text-sm text-muted">
          {completed.length} completed · {newOrders} new · {visible} live{" "}
          {visible === 1 ? "listing" : "listings"}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
          Top tasks
        </h3>
        {tasks.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            You&apos;re all caught up.
          </p>
        ) : (
          <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {tasks.map((t, i) => (
              <Link
                key={i}
                href={t.href}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-card"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      t.urgent ? "bg-amber-500" : "bg-line"
                    }`}
                  />
                  <span className="text-sm text-ink">{t.label}</span>
                </span>
                <span className="text-muted">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/menu"
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand/90"
        >
          Manage menu
        </Link>
        <Link
          href="/dashboard/listings/new"
          className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink hover:bg-card"
        >
          Add a listing
        </Link>
        {cook.status === "active" && (
          <Link
            href={`/kitchen/${cook.slug}`}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink hover:bg-card"
          >
            View public page
          </Link>
        )}
      </div>
    </div>
  );
}
