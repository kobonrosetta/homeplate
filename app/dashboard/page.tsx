import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { SITE_URL, formatUsd } from "@/lib/constants";
import ShareLink from "@/components/share-link";
import EmptyState from "@/components/empty-state";
import {
  MONTH_NAMES,
  formatDueDate,
  formatRate,
  previousQuarter,
  quarterOf,
  taxPortionCents,
  taxRateForCity,
} from "@/lib/tax";

export const dynamic = "force-dynamic";

const PAID_STATUSES = ["confirmed", "in_progress", "ready", "completed"];

export default async function DashboardOverview() {
  const { cook } = await getCurrentCook();
  // A signed-in non-cook (buyer, or mid-onboarding) has no kitchen; the layout
  // redirects too, but guard here so the page can't null-deref cook.id first.
  if (!cook) redirect("/sell");
  const supabase = createClient();

  const now = new Date();
  const qtr = quarterOf(now);
  const prevQtr = previousQuarter(now);

  const [{ data: listings }, { data: orders }, { data: taxOrders }] =
    await Promise.all([
      supabase
        .from("listings")
        .select("id, is_available, limited_quantity, quantity_available")
        .eq("cook_id", cook.id),
      supabase.from("orders").select("status, subtotal_cents").eq("cook_id", cook.id),
      // Paid orders across the previous + current quarters, with each line's
      // served_hot snapshot — feeds the Taxes card below. (If migration 23
      // hasn't run yet this select errors, taxOrders stays null, and the
      // card simply doesn't render.)
      supabase
        .from("orders")
        .select("created_at, status, order_items(line_total_cents, served_hot)")
        .eq("cook_id", cook.id)
        .in("status", PAID_STATUSES)
        .gte("created_at", prevQtr.start.toISOString())
        .lt("created_at", qtr.end.toISOString()),
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

  // Quarterly tax tally (pilot model: prices are tax-included; the cook
  // remits on their own CDTFA seller's permit — this card just does their
  // math). Rendered only when something taxable exists, so cottage bakers
  // never see tax chrome.
  const taxRate = taxRateForCity(cook.city);
  const taxPlace = cook.city?.trim() || "Santa Clara County";
  // Tax is rounded PER LINE (not on month totals) so this card and the CSV
  // export — which shows the tax inside each line — agree to the cent.
  type MonthTally = { sales: number; tax: number };
  const hotByQuarterMonth = new Map<string, Map<number, MonthTally>>();
  for (const o of taxOrders ?? []) {
    const hotItems = ((o as any).order_items ?? []).filter(
      (i: any) => i.served_hot
    );
    const sales = hotItems.reduce(
      (n: number, i: any) => n + (i.line_total_cents ?? 0),
      0
    );
    if (sales <= 0) continue;
    const tax = hotItems.reduce(
      (n: number, i: any) => n + taxPortionCents(i.line_total_cents ?? 0, taxRate),
      0
    );
    const d = new Date(o.created_at);
    const label = quarterOf(d).label;
    const byMonth = hotByQuarterMonth.get(label) ?? new Map<number, MonthTally>();
    const prev = byMonth.get(d.getMonth()) ?? { sales: 0, tax: 0 };
    byMonth.set(d.getMonth(), { sales: prev.sales + sales, tax: prev.tax + tax });
    hotByQuarterMonth.set(label, byMonth);
  }
  const monthRows = (label: string) =>
    [...(hotByQuarterMonth.get(label) ?? new Map<number, MonthTally>())]
      .sort((a, b) => a[0] - b[0])
      .map(([m, t]) => ({
        name: MONTH_NAMES[m],
        salesCents: t.sales,
        taxCents: t.tax,
      }));
  const currentRows = monthRows(qtr.label);
  const currentHot = currentRows.reduce((n, r) => n + r.salesCents, 0);
  const currentTax = currentRows.reduce((n, r) => n + r.taxCents, 0);
  const prevRows = monthRows(prevQtr.label);
  const prevHot = prevRows.reduce((n, r) => n + r.salesCents, 0);
  const prevTax = prevRows.reduce((n, r) => n + r.taxCents, 0);
  // The PREVIOUS quarter is the filable one — surface it until the end of
  // its deadline day (the last day of this quarter's first month).
  const prevDueAhead =
    prevHot > 0 &&
    now.getTime() <= prevQtr.dueDate.getTime() + 24 * 60 * 60 * 1000;
  const showTaxes = currentHot > 0 || prevDueAhead;

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
  if (prevDueAhead)
    tasks.push({
      label: `File your ${prevQtr.label} sales tax by ${formatDueDate(
        prevQtr.dueDate
      )} — your numbers are ready`,
      href: "/dashboard#taxes",
      urgent:
        prevQtr.dueDate.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000,
    });
  if (totalListings === 0)
    tasks.push({
      label: "Add your first item to start selling",
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
      {cook.status === "pending" && (
        <p className="rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand">
          Build your menu now — it goes live the moment you&apos;re approved.
        </p>
      )}

      <div className="rounded-xl border border-line p-5">
        <p className="text-sm text-muted">Earned on completed orders</p>
        <p className="mt-1 text-3xl font-semibold text-ink">{formatUsd(earned)}</p>
        <p className="mt-1 text-sm text-muted">
          {completed.length} completed · {newOrders} new · {visible} live{" "}
          {visible === 1 ? "item" : "items"}
        </p>
      </div>

      {cook.status === "active" && (
        <div className="rounded-xl border border-line bg-card p-5">
          <p className="text-sm font-medium text-ink">Share your kitchen</p>
          <p className="mt-1 text-sm text-muted">
            This link is your storefront — drop it in your WhatsApp groups,
            Instagram bio, anywhere your people are. It unfurls with your food
            photo and your verified badge.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ShareLink
              url={`${SITE_URL}/kitchen/${cook.slug}`}
              text={`Order from ${cook.business_name} on HomePlate — county-verified home cooking`}
              showUrl
            />
          </div>
        </div>
      )}

      {showTaxes && (
        <div id="taxes" className="rounded-xl border border-line p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-muted">Taxes · {qtr.label}</p>
            <p className="text-xs text-faint">
              file by {formatDueDate(qtr.dueDate)}
            </p>
          </div>
          <p className="mt-1 text-3xl font-semibold text-ink">
            {formatUsd(currentTax)}
          </p>
          <p className="mt-1 text-sm text-muted">
            estimated CA sales tax inside your {formatUsd(currentHot)} of
            hot-food sales · {taxPlace} rate {formatRate(taxRate)}
          </p>

          {prevDueAhead && (
            <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
              Your {prevQtr.label} return is due{" "}
              {formatDueDate(prevQtr.dueDate)}: about {formatUsd(prevTax)} on{" "}
              {formatUsd(prevHot)} of hot-food sales.{" "}
              <a
                href="/dashboard/taxes/export?q=prev"
                className="font-medium underline"
              >
                Download the {prevQtr.label} CSV
              </a>
            </p>
          )}

          {currentRows.length > 0 && (
            <div className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line text-sm">
              {currentRows.map((r) => (
                <div
                  key={r.name}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="text-muted">{r.name}</span>
                  <span className="text-ink">
                    {formatUsd(r.salesCents)}
                    <span className="text-faint"> · tax {formatUsd(r.taxCents)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3">
            <a
              href="/dashboard/taxes/export"
              className="inline-block rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink hover:bg-card"
            >
              Download CSV for your filing
            </a>
          </div>

          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">
              How to file in about 10 minutes
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
              <li>
                Log in at onlineservices.cdtfa.ca.gov with your seller&apos;s
                permit.
              </li>
              <li>Open the sales-and-use-tax return for the quarter.</li>
              <li>
                Report your taxable sales — the quarter&apos;s hot-food sales
                minus the tax inside them (the CSV shows every order behind
                the number).
              </li>
              <li>Pay the tax due. Done until next quarter.</li>
            </ol>
            <p className="mt-2 text-xs text-faint">
              Estimates treat your listed prices as tax-included and don&apos;t
              count cold or room-temp items sold to-go. If your situation is
              unusual, double-check with the CDTFA or a tax pro.
            </p>
          </details>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
          Top tasks
        </h3>
        {tasks.length === 0 ? (
          <div className="mt-2">
            <EmptyState title="You're all caught up." />
          </div>
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
