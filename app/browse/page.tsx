import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/constants";
import { publicArea } from "@/lib/handoff";
import VerifiedBadge from "@/components/verified-badge";
import EmptyState from "@/components/empty-state";
import ForkMark from "@/components/fork-mark";

export const metadata = {
  title: "Browse home chefs in Santa Clara County · ForkFork",
  description:
    "County-verified home kitchens near you — hot home-cooked meals and fresh-baked goods from permitted Santa Clara County chefs. Order ahead for pickup or delivery.",
  alternates: { canonical: "/browse" },
};

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const supabase = createClient();
  const { data: cooksData } = await supabase
    .from("cooks")
    .select(
      "id, business_name, slug, city, neighborhood, permit_verified, cuisine_tags, listings(id, photo_url, is_available, price_cents, limited_quantity, quantity_available, kind), reviews(rating)"
    )
    .eq("status", "active")
    .eq("stripe_ready", true) // only kitchens that can actually take an order + get paid
    .order("business_name", { ascending: true })
    .limit(100);

  // One card per kitchen — only kitchens that actually have items for sale.
  const kitchens = (cooksData ?? [])
    .map((c: any) => {
      // Extras (bags, lettering) don't make a kitchen "open" or its thumbnail.
      const avail = (c.listings ?? []).filter(
        (l: any) =>
          l.is_available &&
          (l.kind ?? "dish") === "dish" &&
          (!l.limited_quantity || l.quantity_available > 0)
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
        area: publicArea(c.neighborhood, c.city),
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
          ? `${kitchens.length} home ${
              kitchens.length === 1 ? "kitchen" : "kitchens"
            } open now.`
          : "Verified home chefs and bakers."}
      </p>

      {kitchens.length > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-card px-4 py-3 text-sm text-muted shadow-soft">
          <span aria-hidden className="font-semibold text-brand">
            ✓
          </span>
          <span>
            Every kitchen is matched against Santa Clara County’s
            approved-operator list before it can sell.{" "}
            <Link
              href="/verified"
              className="font-medium text-brand underline-offset-2 hover:underline"
            >
              What this means
            </Link>
          </span>
        </div>
      )}

      {kitchens.length === 0 ? (
        <div className="mt-10"><EmptyState title="No kitchens open yet." subtitle="We're onboarding Santa Clara County's first home kitchens now." /></div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {kitchens.map((k, i) => (
            <Link
              key={k.id}
              href={`/kitchen/${k.slug}`}
              className="rise group flex flex-col overflow-hidden rounded-2xl bg-card shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-lift"
              style={{ animationDelay: `${Math.min(i * 60, 480)}ms` }}
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
                  <div className="flex h-full items-center justify-center text-faint">
                    <ForkMark size={44} />
                  </div>
                )}
                {k.verified && (
                  <div className="absolute left-3 top-3"><VerifiedBadge variant="overlay" /></div>
                )}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-[11px] uppercase tracking-[0.11em] text-faint">
                  {k.area ? `${k.area} · ` : ""}
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
