import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUsd } from "@/lib/constants";
import { formatDateLong } from "@/lib/availability";
import { pickupLocation } from "@/lib/handoff";
import ReviewForm from "@/components/review-form";
import StatusPill from "@/components/status-pill";
import EmptyState from "@/components/empty-state";
import { orderStatusColor } from "@/lib/order-status";

export const dynamic = "force-dynamic";

// "ready" reads differently for pickup vs delivery — resolved per order below.
function statusLabel(status: string, fulfillment: string): string {
  switch (status) {
    case "confirmed":
      return "Paid · sent to the kitchen";
    case "in_progress":
      return "Chef is on it";
    case "ready":
      return fulfillment === "delivery" ? "Out for delivery" : "Ready for pickup";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Paid · sent to the kitchen";
  }
}

export default async function BuyerOrdersPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, status, fulfillment, pickup_time, ready_by_date, delivery_address, total_cents, created_at, cook_id, cooks(business_name, slug, city, profile_id), order_items(title, quantity, line_total_cents), reviews(rating, comment)"
    )
    .eq("buyer_id", user.id)
    .neq("status", "pending")
    .order("created_at", { ascending: false });

  const list = orders ?? [];

  // The pickup spot (home street, or a cook-chosen meetup point — both owner-
  // only cook_private) and the kitchen's contact phone (its profile) are
  // assembled server-side with the admin client so a buyer's order carries
  // the durable handoff details, never shown pre-order — batched over the
  // cooks on the page, not per order.
  const admin = createAdminClient();
  const cookIds = [...new Set(list.map((o: any) => o.cook_id).filter(Boolean))];
  const addrByCook = new Map<string, string | null>();
  const spotByCook = new Map<string, string | null>();
  const phoneByProfile = new Map<string, string | null>();
  if (cookIds.length) {
    const { data: privs } = await admin
      .from("cook_private")
      .select("cook_id, street_address, pickup_location")
      .in("cook_id", cookIds);
    for (const p of privs ?? []) {
      addrByCook.set(p.cook_id, p.street_address);
      spotByCook.set(p.cook_id, p.pickup_location);
    }
    const profileIds = [
      ...new Set(
        list
          .map((o: any) =>
            (Array.isArray(o.cooks) ? o.cooks[0] : o.cooks)?.profile_id
          )
          .filter(Boolean)
      ),
    ] as string[];
    if (profileIds.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, phone")
        .in("id", profileIds);
      for (const pr of profs ?? []) phoneByProfile.set(pr.id, pr.phone);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Purchases</h1>
      <p className="mt-1 text-muted">
        Food you&apos;ve ordered from local kitchens.
      </p>

      {list.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="You haven't ordered yet."
            action={
              <Link href="/browse" className="text-brand hover:underline">
                Browse kitchens
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {list.map((o: any) => {
            const cook = Array.isArray(o.cooks) ? o.cooks[0] : o.cooks;
            const label = statusLabel(o.status, o.fulfillment);
            const review = (o.reviews ?? [])[0];
            const pickupAddr = pickupLocation(
              addrByCook.get(o.cook_id),
              cook?.city,
              spotByCook.get(o.cook_id)
            );
            const kitchenPhone = cook?.profile_id
              ? phoneByProfile.get(cook.profile_id)?.trim() || null
              : null;
            // Handoff details matter until the order is done or cancelled.
            const showHandoff =
              o.status !== "cancelled" && o.status !== "completed";
            const date = new Date(o.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            return (
              <div key={o.id} className="rounded-xl bg-card p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {cook?.slug ? (
                      <Link
                        href={`/kitchen/${cook.slug}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {cook?.business_name ?? "Kitchen"}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">
                        {cook?.business_name ?? "Kitchen"}
                      </span>
                    )}
                    <StatusPill label={label} className={orderStatusColor(o.status)} />
                  </div>
                  <span className="text-sm text-muted">{date}</span>
                </div>

                <ul className="mt-3 space-y-1 text-sm text-ink">
                  {(o.order_items ?? []).map((it: any, i: number) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>
                        {it.quantity}× {it.title}
                      </span>
                      <span className="text-muted">
                        {formatUsd(it.line_total_cents)}
                      </span>
                    </li>
                  ))}
                </ul>

                {showHandoff && (
                  <div className="mt-3 space-y-0.5 border-t border-line pt-3 text-sm">
                    {o.ready_by_date && (
                      <p className="text-ink">
                        <span className="text-faint">Ready by: </span>
                        <span className="font-medium">
                          {formatDateLong(o.ready_by_date)}
                        </span>
                      </p>
                    )}
                    {o.fulfillment === "delivery" ? (
                      <p className="text-ink">
                        <span className="text-faint">Delivering to: </span>
                        {o.delivery_address}
                      </p>
                    ) : (
                      <p className="text-ink">
                        <span className="text-faint">
                          Pickup{o.pickup_time ? ` · ${o.pickup_time}` : ""}:{" "}
                        </span>
                        {pickupAddr ??
                          "The kitchen will message you the pickup address."}
                      </p>
                    )}
                    {kitchenPhone && (
                      <p className="text-ink">
                        <span className="text-faint">Reach the kitchen: </span>
                        <a
                          href={`tel:${kitchenPhone}`}
                          className="text-brand hover:underline"
                        >
                          {kitchenPhone}
                        </a>
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-3 border-t border-line pt-3 text-sm text-muted">
                  Total {formatUsd(o.total_cents)}
                </div>

                {o.status === "completed" &&
                  (review ? (
                    <p className="mt-3 flex items-center gap-1 text-sm text-muted">
                      You rated <Stars n={review.rating} />
                      {review.comment ? `: "${review.comment}"` : ""}
                    </p>
                  ) : (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="text-sm font-medium text-ink">
                        How was it? Leave a review
                      </p>
                      <ReviewForm orderId={o.id} />
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="text-amber-500">
      {"★".repeat(n)}
      <span className="text-faint">{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}
