import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { formatUsd } from "@/lib/constants";
import { toggleListing, deleteListing } from "../listings/actions";

export default async function MenuPage() {
  const { cook } = await getCurrentCook();
  const supabase = createClient();
  const { data: listings } = await supabase
    .from("listings")
    .select("*")
    .eq("cook_id", cook.id)
    .order("created_at", { ascending: false });

  const items = listings ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Your menu</h2>
        <Link
          href="/dashboard/listings/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
        >
          + Add a listing
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-line px-4 py-10 text-center text-muted">
          No listings yet. Add your first item to start selling.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line">
          {items.map((l: any) => (
            <li key={l.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {l.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.photo_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-line text-faint">
                    🍽️
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
