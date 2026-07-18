import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/constants";
import FeeNote from "@/components/fee-note";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const supabase = createClient();
  const { data: cooksData } = await supabase
    .from("cooks")
    .select(
      "id, business_name, slug, city, permit_verified, cuisine_tags, listings(id, photo_url, is_available, price_cents, limited_quantity, quantity_available), reviews(rating)"
    )
    .eq("status", "active")
    .order("business_name", { ascending: true })
    .limit(100);

  // One card per kitchen — only kitchens that actually have items for sale.
  const kitchens = (cooksData ?? [])
    .map((c: any) => {
      const avail = (c.listings ?? []).filter(
        (l: any) =>
          l.is_available && (!l.limited_quantity || l.quantity_available > 0)
      );
      const prices = avail
        .map((l: any) => l.price_cents)
        .filter((n: any) => typeof n === "number" && n > 0);
      const ratings = (c.reviews ?? []).map((r: any) => r.rating);
      const reviewCount = ratings.length;
      return {
        id: c.id,
        name: c.business_name,
        slug: c.slug,
        city: c.city,
        verified: c.permit_verified,
        tags: (c.cuisine_tags ?? []) as string[],
        count: avail.length,
        minPrice: prices.length ? Math.min(...prices) : null,
        reviewCount,
        avgRating: reviewCount
          ? ratings.reduce((a: number, b: number) => a + b, 0) / reviewCount
          : 0,
        thumb: avail.find((l: any) => l.photo_url)?.photo_url ?? null,
      };
    })
    .filter((k) => k.count > 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-ink">Local kitchens</h1>
      <p className="mt-1 text-muted">
        {kitchens.length > 0
          ? `${kitchens.length} verified home ${
              kitchens.length === 1 ? "kitchen" : "kitchens"
            } open now.`
          : "Verified home cooks and bakers."}
      </p>
      <FeeNote className="mt-1" />

      {kitchens.length > 0 && (
        <div className="mt-5 flex items-start gap-2 rounded-lg bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-900">
          <span aria-hidden>✓</span>
          <span>
            Every kitchen is matched against Santa Clara County’s
            approved-operator list before it can sell — no anonymous sellers.{" "}
            <Link href="/verified" className="underline hover:no-underline">
              What that means
            </Link>
          </span>
        </div>
      )}

      {kitchens.length === 0 ? (
        <p className="mt-10 rounded-lg border border-dashed border-line px-4 py-16 text-center text-muted">
          No kitchens open yet. Check back soon.
        </p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {kitchens.map((k) => (
            <Link
              key={k.id}
              href={`/kitchen/${k.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-lift"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-line">
                {k.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={k.thumb}
                    alt={k.name}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl text-faint">
                    🍽️
                  </div>
                )}
                {k.verified && (
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-medium text-emerald-800 backdrop-blur-sm">
                    ✓ Verified
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-[11px] uppercase tracking-[0.11em] text-faint">
                  {k.city ? `${k.city} · ` : ""}
                  {k.count} {k.count === 1 ? "item" : "items"}
                </p>
                <p className="mt-1 font-display text-lg font-semibold leading-tight text-ink">
                  {k.name}
                </p>
                {k.reviewCount > 0 ? (
                  <p className="mt-1.5 text-sm font-medium text-amber-600">
                    ★ {k.avgRating.toFixed(1)}{" "}
                    <span className="font-normal text-faint">
                      ({k.reviewCount})
                    </span>
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-faint">New kitchen</p>
                )}
                {k.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {k.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-line px-2.5 py-0.5 text-xs text-muted"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between pt-4">
                  <span className="text-sm font-semibold text-ink">
                    {k.minPrice != null ? `from ${formatUsd(k.minPrice)}` : " "}
                  </span>
                  <span className="text-xs font-medium text-brand opacity-0 transition group-hover:opacity-100">
                    View kitchen →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
