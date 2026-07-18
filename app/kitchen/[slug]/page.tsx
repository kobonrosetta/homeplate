import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/constants";
import AddToCart from "@/components/add-to-cart";
import FeeNote from "@/components/fee-note";
import ReviewsSection from "@/components/reviews-section";

export const dynamic = "force-dynamic";

export default async function KitchenPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  const { data: cook } = await supabase
    .from("cooks")
    .select(
      "id, business_name, slug, city, operation_type, permit_verified, bio, avatar_url, pickup_available, delivery_available, cuisine_tags"
    )
    .eq("slug", params.slug)
    .eq("status", "active")
    .maybeSingle();

  if (!cook) notFound();

  const { data: listings } = await supabase
    .from("listings")
    .select("*")
    .eq("cook_id", cook.id)
    .eq("is_available", true)
    .order("created_at", { ascending: false });

  const items = listings ?? [];

  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating, comment, created_at")
    .eq("cook_id", cook.id)
    .order("created_at", { ascending: false });
  const revs = reviews ?? [];
  const reviewCount = revs.length;
  const avgRating = reviewCount
    ? revs.reduce((n: number, r: any) => n + r.rating, 0) / reviewCount
    : 0;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {cook.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cook.avatar_url}
              alt={cook.business_name}
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          )}
          <div>
            <h1 className="text-3xl font-semibold text-ink">
              {cook.business_name}
            </h1>
            <p className="mt-1 text-muted">
              {cook.city ? `${cook.city} · ` : ""}
              {cook.operation_type === "mehko" ? "Home kitchen" : "Cottage food"}
            </p>
            {reviewCount > 0 ? (
              <p className="mt-1 text-sm font-medium text-amber-600">
                ★ {avgRating.toFixed(1)}{" "}
                <span className="font-normal text-faint">
                  ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-faint">New kitchen</p>
            )}
          </div>
        </div>
        {cook.permit_verified && (
          <div className="text-right">
            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800">
              ✓ County-verified
            </span>
            <Link
              href="/verified"
              className="mt-1 block text-xs text-muted hover:text-ink"
            >
              What this means
            </Link>
          </div>
        )}
      </div>

      {cook.bio && (
        <p className="mt-4 max-w-2xl leading-relaxed text-ink">{cook.bio}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
        {cook.pickup_available && (
          <span className="rounded-full bg-line px-3 py-1">Pickup</span>
        )}
        {cook.delivery_available && (
          <span className="rounded-full bg-line px-3 py-1">Delivery</span>
        )}
        {(cook.cuisine_tags ?? []).map((t: string) => (
          <span key={t} className="rounded-full bg-line px-3 py-1">
            {t}
          </span>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold text-ink">Menu</h2>
      <FeeNote className="mt-1" />
      {items.length === 0 ? (
        <p className="mt-4 text-muted">No items available right now.</p>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {items.map((l: any) => {
            const soldOut = l.limited_quantity && l.quantity_available <= 0;
            const lowStock =
              l.limited_quantity &&
              l.quantity_available > 0 &&
              l.quantity_available <= 3;
            return (
              <div
                key={l.id}
                className={`flex gap-4 rounded-2xl border border-line bg-card p-4 shadow-soft transition hover:shadow-lift ${
                  soldOut ? "opacity-60" : ""
                }`}
              >
                {l.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.photo_url}
                    alt={l.title}
                    className="h-24 w-24 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-line text-3xl text-faint">
                    🍽️
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/listing/${l.id}`}
                    className="font-display text-[17px] font-semibold leading-tight text-ink hover:underline"
                  >
                    {l.title}
                  </Link>
                  {l.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted">
                      {l.description}
                    </p>
                  )}
                  {l.lead_time_note && (
                    <p className="mt-1 text-xs text-faint">{l.lead_time_note}</p>
                  )}
                  {lowStock && (
                    <p className="mt-1 text-xs font-medium text-amber-600">
                      Only {l.quantity_available} left
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="font-semibold text-ink">
                      {formatUsd(l.price_cents)}
                    </span>
                    {soldOut ? (
                      <span className="rounded-full bg-line px-3 py-1.5 text-sm font-medium text-faint">
                        Sold out
                      </span>
                    ) : (
                      <AddToCart
                        cook={{
                          id: cook.id,
                          name: cook.business_name,
                          slug: cook.slug,
                          pickupAvailable: cook.pickup_available,
                          deliveryAvailable: cook.delivery_available,
                        }}
                        item={{
                          listingId: l.id,
                          title: l.title,
                          priceCents: l.price_cents,
                          photoUrl: l.photo_url,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReviewsSection reviews={revs} />
    </main>
  );
}
