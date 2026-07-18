import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/constants";
import ReviewForm from "@/components/review-form";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Paid · being prepared", cls: "bg-amber-100 text-amber-900" },
  ready: { label: "Ready for pickup", cls: "bg-blue-100 text-blue-900" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-800" },
};

export default async function BuyerOrdersPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, status, total_cents, created_at, cook_id, cooks(business_name, slug), order_items(title, quantity, line_total_cents), reviews(rating, comment)"
    )
    .eq("buyer_id", user.id)
    .neq("status", "pending")
    .order("created_at", { ascending: false });

  const list = orders ?? [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Purchases</h1>
      <p className="mt-1 text-muted">
        Food you&apos;ve ordered from local kitchens.
      </p>

      {list.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line px-4 py-16 text-center text-muted">
          You haven&apos;t ordered yet.{" "}
          <Link href="/browse" className="text-brand hover:underline">
            Browse kitchens
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {list.map((o: any) => {
            const cook = Array.isArray(o.cooks) ? o.cooks[0] : o.cooks;
            const s = STATUS[o.status] ?? STATUS.confirmed;
            const review = (o.reviews ?? [])[0];
            const date = new Date(o.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            return (
              <div key={o.id} className="rounded-xl border border-line p-5">
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
                    >
                      {s.label}
                    </span>
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

                <div className="mt-3 border-t border-line pt-3 text-sm text-muted">
                  Total {formatUsd(o.total_cents)}
                </div>

                {o.status === "completed" &&
                  (review ? (
                    <p className="mt-3 flex items-center gap-1 text-sm text-muted">
                      You rated <Stars n={review.rating} />
                      {review.comment ? ` — "${review.comment}"` : ""}
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
