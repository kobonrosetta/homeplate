import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/constants";
import AddToCart from "@/components/add-to-cart";
import FeeNote from "@/components/fee-note";
import FollowToggle from "@/components/follow-toggle";
import ReviewsSection from "@/components/reviews-section";
import VerifiedBadge from "@/components/verified-badge";
import SoldOutTag from "@/components/sold-out-tag";
import EmptyState from "@/components/empty-state";
import ForkMark from "@/components/fork-mark";

export const dynamic = "force-dynamic";

// One cook fetch per request, shared by generateMetadata and the page body —
// they render in the same pass and used to issue two identical-row queries.
// The active + payout-ready filter here IS the page's visibility rule; keep them
// one. A kitchen that can't take an order (no completed Stripe onboarding) is not
// a live storefront, so it 404s just like a paused one.
const getActiveCook = cache(async (slug: string) => {
  const supabase = createClient();
  const { data } = await supabase
    .from("cooks")
    .select(
      "id, business_name, owner_name, slug, city, neighborhood, operation_type, permit_verified, bio, avatar_url, cover_url, created_at, pickup_available, delivery_available, pickup_windows, cuisine_tags"
    )
    .eq("slug", slug)
    .eq("status", "active")
    .eq("stripe_ready", true)
    .maybeSingle();
  return data;
});

// The kitchen link IS the cook's storefront — when it lands in a WhatsApp
// group or an Instagram bio it must unfurl like a real business: name,
// description, and the branded card from ./opengraph-image (which Next wires
// in as og:image/twitter:image automatically).
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const cook = await getActiveCook(params.slug);
  if (!cook) return {};

  const title = `${cook.business_name} · ForkFork`;
  const description = (
    cook.bio ||
    `${cook.permit_verified ? "County-verified home kitchen" : "Home kitchen"}${
      cook.city ? ` in ${cook.city}` : ""
    }. Browse the menu and order ahead on ForkFork.`
  ).slice(0, 200);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "ForkFork",
      url: `/kitchen/${params.slug}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function KitchenPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  const cook = await getActiveCook(params.slug);
  if (!cook) notFound();

  // Everything below depends only on cook.id — three independent chains
  // (menu → options, reviews, viewer → follow state) run concurrently
  // instead of as five back-to-back round-trips.
  const [menu, reviewsRes, follow] = await Promise.all([
    (async () => {
      const { data: listings } = await supabase
        .from("listings")
        .select("*")
        .eq("cook_id", cook.id)
        .eq("is_available", true)
        .order("created_at", { ascending: false });
      const all = listings ?? [];
      // Listings with cook-defined options send the buyer to the item page
      // to choose (size, character, …) instead of one-tap adding a base item.
      const { data: groupRows } = all.length
        ? await supabase
            .from("listing_option_groups")
            .select("listing_id")
            .in(
              "listing_id",
              all.map((l: any) => l.id)
            )
        : { data: [] as any[] };
      return { all, groupRows: groupRows ?? [] };
    })(),
    supabase
      .from("reviews")
      .select("rating, comment, created_at")
      .eq("cook_id", cook.id)
      .order("created_at", { ascending: false }),
    // Follow state for the viewer. Guests (anonymous checkout sessions)
    // can't follow — there's no email to alert — so they get a sign-up link.
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const canFollow = Boolean(user && !user.is_anonymous);
      if (!canFollow) return { canFollow, following: false };
      const { data: f } = await supabase
        .from("follows")
        .select("id")
        .eq("profile_id", user!.id)
        .eq("cook_id", cook.id)
        .maybeSingle();
      return { canFollow, following: Boolean(f) };
    })(),
  ]);

  const all = menu.all;
  const items = all.filter((l: any) => (l.kind ?? "dish") === "dish");
  const extras = all.filter((l: any) => l.kind === "extra");
  const hasOptions = new Set(menu.groupRows.map((g: any) => g.listing_id));

  const revs = reviewsRes.data ?? [];
  const reviewCount = revs.length;
  const avgRating = reviewCount
    ? revs.reduce((n: number, r: any) => n + r.rating, 0) / reviewCount
    : 0;

  const { canFollow, following } = follow;

  // The storefront leads with food: a cook-set cover photo if they have one,
  // else the first dish photo (browse only surfaces kitchens with in-stock
  // dishes, so there's essentially always one). Cook portrait + join month
  // power the "Meet the cook" block below.
  const heroImage =
    cook.cover_url || items.find((l: any) => l.photo_url)?.photo_url || null;
  const joined = cook.created_at ? new Date(cook.created_at) : null;
  const joinedLabel = joined
    ? joined.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <main className="mx-auto max-w-5xl px-6 pt-8 pb-16">
      {/* Cover hero — the storefront's first impression. A cook-set cover wins;
          otherwise the first dish photo stands in, so every kitchen leads with
          food, not text. */}
      {heroImage && (
        <div className="relative mb-6 aspect-[16/7] overflow-hidden rounded-3xl bg-line sm:aspect-[16/6]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImage}
            alt={cook.business_name}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl font-semibold text-ink">
              {cook.business_name}
            </h1>
            {cook.permit_verified && <VerifiedBadge />}
          </div>
          <p className="mt-1.5 text-muted">
            {[cook.neighborhood, cook.city].filter(Boolean).join(", ")}
            {cook.neighborhood || cook.city ? " · " : ""}
            {cook.operation_type === "mehko" ? "Home kitchen" : "Home bakery"}
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
        <div className="flex shrink-0 flex-col items-end gap-1">
          {canFollow ? (
            // Client toggle (hits /api/follow) rather than a server action:
            // it surfaces a rejected follow (e.g. kitchen just paused) as a
            // visible message instead of silently re-rendering "Follow".
            <FollowToggle cookId={cook.id} initialFollowing={following} />
          ) : (
            // Signed out → sign up, then land back on THIS kitchen (not /browse).
            <Link
              href={`/signup?next=/kitchen/${cook.slug}`}
              className="rounded-full border border-brand px-4 py-1.5 text-sm font-medium text-brand transition hover:bg-brand hover:text-white"
            >
              ♡ Follow
            </Link>
          )}
          <p className="max-w-[11rem] text-right text-xs text-faint">
            Followers get an email when new dishes are posted.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted">
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

      {cook.pickup_available && (cook.pickup_windows ?? []).length > 0 && (
        <p className="mt-2 text-sm text-muted">
          <span className="font-medium text-ink">Pickup times:</span>{" "}
          {(cook.pickup_windows as string[]).join(" · ")}
        </p>
      )}

      <h2 className="mt-12 text-lg font-semibold text-ink">Menu</h2>
      <FeeNote className="mt-1" />
      {items.length === 0 ? (
        <div className="mt-4"><EmptyState title="No items available right now." /></div>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((l: any, i: number) => {
            const soldOut = l.limited_quantity && l.quantity_available <= 0;
            const lowStock =
              l.limited_quantity &&
              l.quantity_available > 0 &&
              l.quantity_available <= 3;
            return (
              <div
                key={l.id}
                className={`rise group flex flex-col overflow-hidden rounded-2xl bg-card shadow-soft transition hover:shadow-lift ${
                  soldOut ? "opacity-60" : ""
                }`}
                style={{ animationDelay: `${Math.min(i * 60, 480)}ms` }}
              >
                <Link
                  href={`/listing/${l.id}`}
                  className="block aspect-[4/3] overflow-hidden bg-line"
                >
                  {l.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.photo_url}
                      alt={l.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-faint">
                      <ForkMark size={44} />
                    </div>
                  )}
                </Link>
                <div className="flex flex-1 flex-col p-4">
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
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <span className="font-semibold text-ink">
                      {hasOptions.has(l.id)
                        ? `from ${formatUsd(l.price_cents)}`
                        : formatUsd(l.price_cents)}
                    </span>
                    {soldOut ? (
                      <SoldOutTag />
                    ) : hasOptions.has(l.id) ? (
                      <Link
                        href={`/listing/${l.id}`}
                        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
                      >
                        Choose options
                      </Link>
                    ) : (
                      <AddToCart
                        cook={{
                          id: cook.id,
                          name: cook.business_name,
                          slug: cook.slug,
                          pickupAvailable: cook.pickup_available,
                          deliveryAvailable: cook.delivery_available,
                          pickupWindows: cook.pickup_windows ?? [],
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

      {extras.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold text-ink">Extras</h2>
          <p className="mt-1 text-sm text-muted">
            Little extras from this kitchen to round out your order.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {extras.map((l: any) => {
              const soldOut = l.limited_quantity && l.quantity_available <= 0;
              return (
                <div
                  key={l.id}
                  className={`flex items-center gap-3 rounded-xl bg-card p-3 shadow-soft ${
                    soldOut ? "opacity-60" : ""
                  }`}
                >
                  {l.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.photo_url}
                      alt={l.title}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-line text-xl text-faint">
                      🎀
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {l.title}
                    </p>
                    <p className="text-sm text-muted">{formatUsd(l.price_cents)}</p>
                  </div>
                  {soldOut ? (
                    <SoldOutTag />
                  ) : (
                    <AddToCart
                      cook={{
                        id: cook.id,
                        name: cook.business_name,
                        slug: cook.slug,
                        pickupAvailable: cook.pickup_available,
                        deliveryAvailable: cook.delivery_available,
                        pickupWindows: cook.pickup_windows ?? [],
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
              );
            })}
          </div>
        </>
      )}

      {/* Meet the cook — who's behind the kitchen, the trust story a home-food
          buyer actually decides on. Degrades gracefully: a monogram when
          there's no photo, and it still carries the name + credentials when
          there's no story yet. */}
      <section className="mt-14 border-t border-line pt-10">
        <h2 className="text-lg font-semibold text-ink">Meet the chef</h2>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
          {cook.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cook.avatar_url}
              alt={cook.owner_name || cook.business_name}
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-2xl font-semibold text-brand">
              {(cook.owner_name || cook.business_name || "?")
                .trim()
                .charAt(0)
                .toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold text-ink">
              {cook.owner_name || `The chef behind ${cook.business_name}`}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {cook.operation_type === "mehko" ? "Home chef" : "Home baker"}
              {cook.city ? ` in ${cook.city}` : ""}
              {joinedLabel ? ` · on ForkFork since ${joinedLabel}` : ""}
            </p>
            {cook.bio && (
              <p className="mt-3 max-w-2xl leading-relaxed text-ink">
                {cook.bio}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {cook.permit_verified && (
                <span className="inline-flex items-center gap-2">
                  <VerifiedBadge />
                  <Link
                    href="/verified"
                    className="text-xs text-muted hover:text-ink"
                  >
                    What this means
                  </Link>
                </span>
              )}
              {reviewCount > 0 && (
                <span className="text-sm font-medium text-amber-600">
                  ★ {avgRating.toFixed(1)}{" "}
                  <span className="font-normal text-faint">
                    ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <ReviewsSection reviews={revs} />
    </main>
  );
}
