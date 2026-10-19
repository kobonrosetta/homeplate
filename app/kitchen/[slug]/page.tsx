import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd, SITE_URL } from "@/lib/constants";
import ShareLink from "@/components/share-link";
import AddToCart from "@/components/add-to-cart";
import AvailabilityPill from "@/components/availability-pill";
import {
  availabilityFromListing,
  isListingOpen,
  isOrderable,
  pacificTodayIso,
} from "@/lib/availability";
import {
  MENU_SECTIONS,
  menuSectionFor,
  splitFeedsFromTitle,
  cookTagline,
  sectionedMenuIds,
  stripSectionPrefix,
  groupSizeVariants,
  feedsRange,
  type SizeGroup,
} from "@/lib/menu-display";
import CartBar from "@/components/cart-bar";
import MenuTabs from "@/components/menu-tabs";
import SectionLink from "@/components/section-link";
import HashScroll from "@/components/hash-scroll";
import FeeNote from "@/components/fee-note";
import FollowToggle from "@/components/follow-toggle";
import ReviewsSection from "@/components/reviews-section";
import VerifiedBadge from "@/components/verified-badge";
import SoldOutTag from "@/components/sold-out-tag";
import EmptyState from "@/components/empty-state";
import ForkMark from "@/components/fork-mark";
import JsonLd from "@/components/json-ld";
import { kitchenSchema, breadcrumbSchema } from "@/lib/schema";
import { publicArea, titleCase } from "@/lib/handoff";

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
      "id, business_name, owner_name, slug, city, neighborhood, operation_type, permit_verified, bio, tagline, avatar_url, cover_url, created_at, pickup_available, delivery_available, delivery_notes, pickup_windows, cuisine_tags"
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
      cook.city ? ` in ${titleCase(cook.city)}` : ""
    }. Browse the menu and order ahead on ForkFork.`
  ).slice(0, 200);

  return {
    title,
    description,
    alternates: { canonical: `/kitchen/${params.slug}` },
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
      // A group only counts when it has at least one option — the same rule
      // deriveUnitPrice applies at checkout.
      const { data: groupRows, error: groupErr } = all.length
        ? await supabase
            .from("listing_option_groups")
            .select("listing_id, listing_options(id)")
            .in(
              "listing_id",
              all.map((l: any) => l.id)
            )
        : { data: [] as any[], error: null };
      return { all, groupRows: groupRows ?? [], groupErr: !!groupErr };
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
  const today = pacificTodayIso();
  // A dish a buyer can't act on right now — sold out, or a preorder past its
  // order-by cutoff ("Ordering closed") — moves OUT of the main menu into a
  // collapsed "currently unavailable" block at the bottom, so a wall of
  // closed items never buries the ones they can actually add to the cart.
  const dishClosed = (l: any) => !isListingOpen(l, today);
  const dishes = all.filter((l: any) => (l.kind ?? "dish") === "dish");
  // Within the open menu, photographed dishes lead: the first row is the
  // storefront's handshake, and a gray placeholder on a $185 tray makes a
  // worse first impression than a $5 side with a great shot. Stable sort, so
  // newest-first order holds within each half.
  const openDishes = dishes
    .filter((l: any) => !dishClosed(l))
    .sort((a: any, b: any) => Number(!a.photo_url) - Number(!b.photo_url));
  const closedDishes = dishes.filter(dishClosed);
  // Sectioning is derived from the cook's own title conventions
  // ("BUFFET-STYLE: …", "FAMILY-STYLE: …"); sectionedMenuIds owns the rule
  // (real split only — a kitchen without the convention keeps a flat grid).
  const sections = MENU_SECTIONS.map((s) => ({
    ...s,
    items: openDishes.filter((l: any) => menuSectionFor(l.title) === s.id),
  })).filter((s) => s.items.length > 0);
  const useSections =
    sectionedMenuIds(openDishes.map((l: any) => l.title)) !== null;
  // How many people the trays feed, for the "Feeding a crowd?" bridge.
  const traysFeed = feedsRange(
    (sections.find((s) => s.id === "trays")?.items ?? []).map((l: any) => l.title)
  );
  const extras = all.filter((l: any) => l.kind === "extra");
  // Fail closed: if the options lookup errored we can't tell which listings
  // need a choice, so every one goes to its page rather than risking a one-tap
  // add that checkout would refuse ("Please choose every option").
  const hasOptions = menu.groupErr
    ? new Set<string>(all.map((l: any) => l.id))
    : new Set<string>(
        menu.groupRows
          .filter((g: any) => (g.listing_options ?? []).length > 0)
          .map((g: any) => g.listing_id)
      );

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
    cook.cover_url ||
    openDishes.find((l: any) => l.photo_url)?.photo_url ||
    dishes.find((l: any) => l.photo_url)?.photo_url ||
    null;
  const joined = cook.created_at ? new Date(cook.created_at) : null;
  const joinedLabel = joined
    ? joined.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  // One dish card, reused by the sectioned grid, the flat fallback grid, and
  // the collapsed "currently unavailable" block. The feeds parenthetical is
  // lifted out of the (often ALL-CAPS) title into a quiet chip beside the
  // availability pill, so party size gets MORE visible while titles shout less.
  const cartCook = {
    id: cook.id,
    name: cook.business_name,
    slug: cook.slug,
    pickupAvailable: cook.pickup_available,
    deliveryAvailable: cook.delivery_available,
    pickupWindows: cook.pickup_windows ?? [],
  };
  const renderDish = (
    l: any,
    i: number,
    opts: { stripPrefix?: boolean } = {}
  ) => {
    const soldOut = l.limited_quantity && l.quantity_available <= 0;
    // A preorder past its cutoff can't be ordered — treat like sold out.
    const orderable = isOrderable(availabilityFromListing(l), today);
    const blocked = soldOut || !orderable;
    const lowStock =
      l.limited_quantity &&
      l.quantity_available > 0 &&
      l.quantity_available <= 3;
    const split = splitFeedsFromTitle(l.title);
    const disp = {
      ...split,
      title: opts.stripPrefix ? stripSectionPrefix(split.title) : split.title,
    };
    return (
      <div
        key={l.id}
        // The dish page's "Back to menu" returns to exactly this card.
        id={`dish-${l.id}`}
        className={`rise group flex scroll-mt-4 flex-col overflow-hidden rounded-2xl bg-card shadow-soft transition hover:shadow-lift ${
          blocked ? "opacity-60" : ""
        }`}
        style={{ animationDelay: `${Math.min(i * 60, 480)}ms` }}
      >
        {/* Same destination as the title link below — kept out of the tab
            order and the accessibility tree (it has no name without a photo). */}
        <Link
          href={`/listing/${l.id}`}
          aria-hidden="true"
          tabIndex={-1}
          className="block aspect-[4/3] overflow-hidden bg-line"
        >
          {l.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={l.photo_url}
              alt={l.title}
              loading="lazy"
              decoding="async"
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
            {disp.title}
          </Link>
          {l.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted">
              {l.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <AvailabilityPill
              listing={l}
              today={today}
              // Windows are PICKUP days — meaningless (possibly stale)
              // when the kitchen doesn't offer pickup.
              pickupWindows={
                cook.pickup_available ? cook.pickup_windows : null
              }
            />
            {disp.feeds && (
              <span className="inline-flex items-center rounded-full border border-line bg-bg px-2.5 py-0.5 text-xs font-medium text-muted">
                {disp.feeds}
              </span>
            )}
          </div>
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
            ) : !orderable ? (
              <span className="rounded-full bg-line/60 px-3 py-1 text-xs font-medium text-muted">
                Ordering closed
              </span>
            ) : hasOptions.has(l.id) ? (
              <Link
                href={`/listing/${l.id}`}
                className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
              >
                Choose options
              </Link>
            ) : (
              <AddToCart
                cook={cartCook}
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
  };

  // One card for a dish listed once per size: the shared photo, title and
  // description once, then a row per size (smallest first), each adding its
  // OWN listing — cart, checkout and orders are untouched. Only open dishes
  // reach here, so every row is orderable; a size with options sends the
  // buyer to that size's page to choose, like a dish card does.
  const renderGroup = (g: SizeGroup<any>, i: number) => {
    const rows = [...g.members].sort(
      (a, b) => a.item.price_cents - b.item.price_cents
    );
    const lead = rows.find((r) => r.item.photo_url)?.item ?? rows[0].item;
    // One description for the card only when every size says the same thing
    // (ignoring case/punctuation — her Mac & Cheese pair differs by a comma).
    // Sizes with different contents (the family dinner: "your choice main,
    // 6 muffins" vs "12pc chicken, 12 muffins") each describe themselves.
    const normDesc = (s: unknown) =>
      String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const sameDescription = rows.every(
      (r) => normDesc(r.item.description) === normDesc(rows[0].item.description)
    );
    const description = sameDescription
      ? rows.find((r) => r.item.description)?.item.description
      : null;
    // One availability pill when every size shares the same timing (the
    // usual case); otherwise each row carries its own.
    const timing = (l: any) =>
      [l.fulfillment_mode, l.lead_days, l.ready_date, l.order_by].join("|");
    const sameTiming = rows.every((r) => timing(r.item) === timing(rows[0].item));
    const pickupWindows = cook.pickup_available ? cook.pickup_windows : null;
    const title = stripSectionPrefix(g.title);
    return (
      <div
        key={g.key}
        className="rise group flex flex-col overflow-hidden rounded-2xl bg-card shadow-soft transition hover:shadow-lift"
        style={{ animationDelay: `${Math.min(i * 60, 480)}ms` }}
      >
        <Link
          href={`/listing/${lead.id}`}
          aria-hidden="true"
          tabIndex={-1}
          className="block aspect-[4/3] overflow-hidden bg-line"
        >
          {lead.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lead.photo_url}
              alt={title}
              loading="lazy"
              decoding="async"
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
            href={`/listing/${lead.id}`}
            className="font-display text-[17px] font-semibold leading-tight text-ink hover:underline"
          >
            {title}
          </Link>
          {description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted">{description}</p>
          )}
          {sameTiming && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <AvailabilityPill
                listing={rows[0].item}
                today={today}
                pickupWindows={pickupWindows}
              />
            </div>
          )}
          <ul className="mt-auto divide-y divide-line pt-3">
            {rows.map(({ item: l, size }) => {
              const lowStock =
                l.limited_quantity &&
                l.quantity_available > 0 &&
                l.quantity_available <= 3;
              return (
                <li
                  key={l.id}
                  // "Back to menu" from this size's page lands on its row.
                  id={`dish-${l.id}`}
                  className="flex scroll-mt-4 items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/listing/${l.id}`}
                      className="text-sm text-muted hover:text-ink hover:underline"
                    >
                      {size}
                    </Link>
                    {!sameDescription && l.description && (
                      <p className="line-clamp-2 text-xs text-muted">
                        {l.description}
                      </p>
                    )}
                    <p className="font-semibold text-ink">
                      {hasOptions.has(l.id)
                        ? `from ${formatUsd(l.price_cents)}`
                        : formatUsd(l.price_cents)}
                    </p>
                    {lowStock && (
                      <p className="text-xs font-medium text-amber-600">
                        Only {l.quantity_available} left
                      </p>
                    )}
                    {!sameTiming && (
                      <AvailabilityPill
                        listing={l}
                        today={today}
                        pickupWindows={pickupWindows}
                        className="mt-1"
                      />
                    )}
                  </div>
                  {hasOptions.has(l.id) ? (
                    <Link
                      href={`/listing/${l.id}`}
                      aria-label={`Choose options for ${title}, ${size}`}
                      className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
                    >
                      Choose options
                    </Link>
                  ) : (
                    <AddToCart
                      cook={cartCook}
                      context={`${title}, ${size}`}
                      item={{
                        listingId: l.id,
                        title: l.title,
                        priceCents: l.price_cents,
                        photoUrl: l.photo_url,
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  };


  return (
    <main className="mx-auto max-w-5xl px-6 pt-8 pb-16">
      <JsonLd
        data={[
          kitchenSchema({
            slug: cook.slug,
            name: cook.business_name,
            operationType: cook.operation_type,
            description: cook.bio,
            city: cook.city,
            image: heroImage,
            ratingValue: avgRating,
            reviewCount,
            cuisines: (cook.cuisine_tags ?? []) as string[],
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Kitchens", path: "/browse" },
            { name: cook.business_name, path: `/kitchen/${cook.slug}` },
          ]),
        ]}
      />
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
            {publicArea(cook.neighborhood, cook.city)}
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
          <ShareLink
            url={`${SITE_URL}/kitchen/${cook.slug}`}
            text={`${cook.business_name} on ForkFork — county-verified home cooking in ${titleCase(cook.city) || "Santa Clara County"}`}
            label="↗ Share"
            className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-muted transition hover:border-muted hover:text-ink"
          />
        </div>
      </div>

      {/* Plain text, not pills: on this page a pill shape means "tap me"
          (the menu tabs, Follow, Share), and look-alike tags read as broken
          buttons. Pickup/Delivery are spelled out in the lines below. */}
      {/* One block so the first visible line always sits the same distance
          under the header, whichever lines this kitchen has. */}
      <div className="mt-4 space-y-1 text-sm text-muted">
        {(cook.cuisine_tags ?? []).length > 0 && (
          <p>{(cook.cuisine_tags as string[]).join(" · ")}</p>
        )}
        {cook.pickup_available &&
          ((cook.pickup_windows ?? []).length > 0 ? (
            <p>
              <span className="font-medium text-ink">Pickup times:</span>{" "}
              {(cook.pickup_windows as string[]).join(" · ")}
            </p>
          ) : (
            <p>
              <span className="font-medium text-ink">Pickup:</span> available
              &mdash; time arranged with the kitchen
            </p>
          ))}
        {cook.delivery_available && (
          <p>
            <span className="font-medium text-ink">Delivery:</span>{" "}
            {cook.delivery_notes || "available — details at checkout"}
          </p>
        )}
      </div>

      {/* Chef strip — the trust story's face above the menu. One glance says
          "a real person cooks this"; the full bio stays in "Meet the chef"
          below, one tap away via the anchor. */}
      <SectionLink
        id="meet-the-chef"
        className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-soft transition hover:shadow-lift sm:max-w-xl"
      >
        {cook.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cook.avatar_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-lg font-semibold text-brand">
            {(cook.owner_name || cook.business_name || "?")
              .trim()
              .charAt(0)
              .toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="flex items-baseline gap-2 text-sm font-semibold text-ink">
            <span className="truncate">
              By {cook.owner_name || cook.business_name}
            </span>
            <span className="shrink-0 text-xs font-medium text-brand">
              Meet the chef <span aria-hidden="true">↓</span>
            </span>
          </p>
          {cookTagline(cook.tagline, cook.bio) && (
            <p className="truncate text-sm text-muted">
              {cookTagline(cook.tagline, cook.bio)}
            </p>
          )}
        </div>
      </SectionLink>

      <h2 className="mt-12 text-lg font-semibold text-ink">Menu</h2>
      <FeeNote className="mt-1" />
      {dishes.length === 0 ? (
        <div className="mt-4"><EmptyState title="No items available right now." /></div>
      ) : (
        <>
          {useSections ? (
            // The wrapper bounds the pinned tabs: they stick for exactly the
            // length of the sections, then release before Extras / chef /
            // reviews. Jumps land a heading just under the ~47px bar via the
            // page-level scroll-padding (globals.css) — no per-section
            // scroll-margin, or the two would add up.
            <div>
              <MenuTabs
                cookSlug={cook.slug}
                sections={sections.map((s) => ({ id: s.id, label: s.tab }))}
              />
              {sections.map((s) => (
                <section key={s.id} id={s.id}>
                  <h3 className="mt-8 font-display text-xl font-semibold text-ink">
                    {s.title}
                  </h3>
                  <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {s.id === "plates-sides"
                      ? s.items.map((l: any, i: number) => renderDish(l, i))
                      : // Trays + family dinners: one card per dish with a row
                        // per size, not a near-identical card per size.
                        groupSizeVariants(s.items).map((g, i) =>
                          g.members.length > 1
                            ? renderGroup(g, i)
                            : renderDish(g.members[0].item, i, {
                                stripPrefix: true,
                              })
                        )}
                  </div>
                  {s.id === "plates-sides" &&
                    sections.some((x) => x.id === "trays") && (
                      <SectionLink
                        id="trays"
                        className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-5 py-4 text-sm transition hover:border-muted"
                      >
                        <span>
                          <span className="font-medium text-ink">
                            Feeding a crowd?
                          </span>{" "}
                          <span className="text-muted">
                            Buffet trays
                            {traysFeed ? ` for ${traysFeed} people` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium text-brand">
                          See trays <span aria-hidden="true">→</span>
                        </span>
                      </SectionLink>
                    )}
                </section>
              ))}
            </div>
          ) : openDishes.length > 0 ? (
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {openDishes.map((l: any, i: number) => renderDish(l, i))}
            </div>
          ) : null}
          {closedDishes.length > 0 && (
            <>
              {openDishes.length === 0 && (
                <p className="mt-4 text-sm text-muted">
                  Nothing&rsquo;s orderable right now &mdash; follow the kitchen
                  for a heads-up when dishes come back.
                </p>
              )}
              <h3 className="mt-10 text-sm font-medium text-muted">
                Currently unavailable
              </h3>
              <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {closedDishes.slice(0, 3).map((l: any, i: number) => renderDish(l, i))}
              </div>
              {closedDishes.length > 3 && (
                <details className="mt-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                    {closedDishes.length - 3} more currently unavailable ›
                  </summary>
                  <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {closedDishes.slice(3).map((l: any, i: number) => renderDish(l, i))}
                  </div>
                </details>
              )}
            </>
          )}
        </>
      )}

      {extras.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold text-ink">Extras</h2>
          <p className="mt-1 text-sm text-muted">
            Little extras from this kitchen to round out your order.
          </p>
          {/* grid-cols-1 = minmax(0,1fr): without it the implicit track sizes
              to the longest title's full width and the whole page scrolls
              sideways on phones (41px at 360px, Oct 2026). */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {extras.map((l: any) => {
              const soldOut = l.limited_quantity && l.quantity_available <= 0;
              return (
                <div
                  key={l.id}
                  id={`dish-${l.id}`}
                  className={`flex scroll-mt-4 items-center gap-3 rounded-xl bg-card p-3 shadow-soft ${
                    soldOut ? "opacity-60" : ""
                  }`}
                >
                  {l.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.photo_url}
                      alt={l.title}
                      loading="lazy"
                      decoding="async"
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
                    <p className="text-sm text-muted">
                      {hasOptions.has(l.id)
                        ? `from ${formatUsd(l.price_cents)}`
                        : formatUsd(l.price_cents)}
                    </p>
                  </div>
                  {soldOut ? (
                    <SoldOutTag />
                  ) : hasOptions.has(l.id) ? (
                    // Same gate as dish cards: an extra with options must be
                    // chosen on its page — a one-tap add would put it in the
                    // cart without them, and checkout then refuses it.
                    <Link
                      href={`/listing/${l.id}`}
                      className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
                    >
                      Choose options
                      <span className="sr-only"> for {l.title}</span>
                    </Link>
                  ) : (
                    <AddToCart
                      cook={cartCook}
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
      <section
        id="meet-the-chef"
        className="mt-14 scroll-mt-8 border-t border-line pt-10"
      >
        <h2 className="text-lg font-semibold text-ink">Meet the chef</h2>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
          {cook.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cook.avatar_url}
              alt={cook.owner_name || cook.business_name}
              loading="lazy"
              decoding="async"
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
              {cook.city ? ` in ${titleCase(cook.city)}` : ""}
              {joinedLabel ? ` · on ForkFork since ${joinedLabel}` : ""}
            </p>
            {cook.bio && (
              <p className="mt-3 max-w-2xl whitespace-pre-line leading-relaxed text-ink">
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
      <CartBar />
      <HashScroll />
    </main>
  );
}
