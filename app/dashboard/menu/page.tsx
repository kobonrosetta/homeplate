import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { formatUsd } from "@/lib/constants";
import { FormError } from "@/components/form";
import EmptyState from "@/components/empty-state";
import ForkMark from "@/components/fork-mark";
import { toggleListing, deleteListing } from "../listings/actions";
import { parsePickupDays } from "@/lib/availability";

export default async function MenuPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { cook } = await getCurrentCook();
  if (!cook) redirect("/sell");
  const supabase = createClient();
  const { data: listings } = await supabase
    .from("listings")
    .select("*")
    .eq("cook_id", cook.id)
    .order("created_at", { ascending: false });

  const items = listings ?? [];

  // Honest-timing nudge: a kitchen with LIMITED pickup days plus zero-notice
  // ("ready now") dishes is implicitly promising same-day handoff on those
  // days — which a batch cook usually can't honor. Say so, once, right here.
  const handoffDays = parsePickupDays(cook.pickup_windows);
  const zeroNoticeDishes = items.filter(
    (l: any) =>
      (l.kind ?? "dish") === "dish" &&
      (l.fulfillment_mode ?? "ready_now") === "ready_now"
  ).length;
  const showNoticeNudge =
    cook.pickup_available !== false &&
    handoffDays !== null &&
    handoffDays.size <= 5 &&
    zeroNoticeDishes > 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Your menu</h2>
        <Link
          href="/dashboard/listings/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
        >
          + Add an item
        </Link>
      </div>

      <div className="mt-4">
        <FormError message={searchParams.error} />
      </div>

      {showNoticeNudge && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">
            Can buyers really order same-day on your pickup days?
          </p>
          <p className="mt-1">
            Your pickup times are limited, but {zeroNoticeDishes}{" "}
            {zeroNoticeDishes === 1 ? "dish is" : "dishes are"} set to
            &ldquo;ready now&rdquo; — so on a pickup day, buyers can order for
            same-day handoff. If you need heads-up to cook, edit each dish and
            give it a lead time (e.g. &ldquo;2 days&rsquo; notice&rdquo;) —
            buyers will then see the right &ldquo;Get it&rdquo; date up front.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No items yet."
            subtitle="Add your first item to start selling."
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-xl bg-card shadow-soft">
          {items.map((l: any) => (
            <li key={l.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {l.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.photo_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-line text-faint">
                    <ForkMark size={20} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-ink">{l.title}</p>
                  <p className="text-sm text-muted">
                    {formatUsd(l.price_cents)} ·{" "}
                    {l.limited_quantity
                      ? l.quantity_available > 0
                        ? `${l.quantity_available} left`
                        : "Sold out"
                      : "Made to order"}
                    {l.is_available ? "" : " · hidden"}
                    {typeof l.photo_quality_score === "number"
                      ? ` · photo ${l.photo_quality_score}/100`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/dashboard/listings/${l.id}/edit`}
                  className="rounded-full border border-line px-3 py-1.5 text-sm text-ink hover:bg-card"
                >
                  Edit
                </Link>
                <form action={toggleListing}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="next" value={String(!l.is_available)} />
                  <button
                    type="submit"
                    className="rounded-full border border-line px-3 py-1.5 text-sm text-ink hover:bg-card"
                  >
                    {l.is_available ? "Hide" : "Show"}
                  </button>
                </form>
                <form action={deleteListing}>
                  <input type="hidden" name="id" value={l.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-line px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
