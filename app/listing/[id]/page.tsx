import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/constants";
import { allergenLabels } from "@/lib/allergens";
import {
  availabilityFromListing,
  isOrderable,
  pacificTodayIso,
} from "@/lib/availability";
import AddToCart from "@/components/add-to-cart";
import AvailabilityPill from "@/components/availability-pill";
import FeeNote from "@/components/fee-note";
import PhotoGallery from "@/components/photo-gallery";
import OptionsPicker from "@/components/options-picker";
import SoldOutTag from "@/components/sold-out-tag";
import JsonLd from "@/components/json-ld";
import { listingSchema, breadcrumbSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

// One listing fetch per request, shared by generateMetadata and the page body
// (they render in the same pass and used to issue two identical queries).
// Returns { listing, cook } with the page's visibility rule applied.
const getListing = cache(async (id: string) => {
  const supabase = createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select(
      "*, cooks!inner(id, business_name, slug, city, permit_verified, status, stripe_ready, pickup_available, delivery_available, pickup_windows)"
    )
    .eq("id", id)
    .eq("is_available", true)
    .maybeSingle();
  const cook: any = Array.isArray(listing?.cooks)
    ? listing?.cooks[0]
    : listing?.cooks;
  // Same visibility rule as browse/kitchen: a kitchen that can't take an order
  // (not payout-ready) has no live listing pages either.
  if (!listing || !cook || cook.status !== "active" || !cook.stripe_ready)
    return null;
  return { listing, cook };
});

// A dish link shared in a group chat should unfurl as the dish: photo, name,
// kitchen, price — a menu item, not a bare URL.
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  const found = await getListing(params.id);
  if (!found) return {};
  const { listing, cook } = found;

  const title = `${listing.title} · ${cook.business_name}`;
  const description = (
    listing.description ||
    `${formatUsd(listing.price_cents)} · homemade in ${
      cook.permit_verified ? "a county-verified home kitchen" : "a local home kitchen"
    }. Order on ForkFork.`
  ).slice(0, 200);

  return {
    title,
    description,
    alternates: { canonical: `/listing/${params.id}` },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "ForkFork",
      url: `/listing/${params.id}`,
      images: listing.photo_url ? [{ url: listing.photo_url }] : undefined,
    },
    twitter: {
      card: listing.photo_url ? "summary_large_image" : "summary",
      title,
      description,
    },
  };
}

export default async function ListingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const found = await getListing(params.id);
  if (!found) notFound();
  const { listing, cook } = found;

  // Cook-defined options (size, character, …) — buyers pick before adding.
  const { data: groupRows } = await supabase
    .from("listing_option_groups")
    .select("id, name, sort_order, listing_options(id, name, price_delta_cents, sort_order)")
    .eq("listing_id", listing.id)
    .order("sort_order", { ascending: true });
  const optionGroups = (groupRows ?? [])
    .map((g: any) => ({
      id: g.id,
      name: g.name,
      options: [...(g.listing_options ?? [])].sort(
        (a: any, b: any) => a.sort_order - b.sort_order
      ),
    }))
    .filter((g: any) => g.options.length > 0);
  const hasOptions = optionGroups.length > 0;

  const soldOut = listing.limited_quantity && listing.quantity_available <= 0;
  const today = pacificTodayIso();
  const orderable = isOrderable(availabilityFromListing(listing), today);
  const galleryUrls = [listing.photo_url, ...(listing.photo_urls ?? [])].filter(
    Boolean
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <JsonLd
        data={[
          listingSchema({
            id: listing.id,
            title: listing.title,
            description: listing.description,
            image: listing.photo_url,
            priceCents: listing.price_cents,
            available: !soldOut,
            kitchenName: cook.business_name,
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Kitchens", path: "/browse" },
            { name: cook.business_name, path: `/kitchen/${cook.slug}` },
            { name: listing.title, path: `/listing/${listing.id}` },
          ]),
        ]}
      />
      <Link href="/browse" className="text-sm text-muted hover:text-ink">
        ← Back
      </Link>

      <div className="mt-4 grid gap-8 sm:grid-cols-2">
        <PhotoGallery urls={galleryUrls} alt={listing.title} />

        <div>
          <h1 className="text-2xl font-semibold text-ink">{listing.title}</h1>
          {!hasOptions && (
            <>
              <p className="mt-1 text-xl font-semibold text-ink">
                {formatUsd(listing.price_cents)}
              </p>
              <FeeNote priceCents={listing.price_cents} className="mt-1" />
            </>
          )}
          {hasOptions && (
            <p className="mt-1 text-sm text-muted">
              from {formatUsd(listing.price_cents)} · choose your options below
            </p>
          )}
          {listing.limited_quantity &&
            listing.quantity_available > 0 &&
            listing.quantity_available <= 3 && (
              <p className="mt-1 text-sm font-medium text-amber-600">
                Only {listing.quantity_available} left
              </p>
            )}

          <Link
            href={`/kitchen/${cook.slug}`}
            className="mt-3 inline-block text-sm text-muted hover:text-ink"
          >
            {cook.business_name}
            {cook.permit_verified ? " · ✓ County-verified" : ""}
            {cook.city ? ` · ${cook.city}` : ""}
          </Link>

          {listing.description && (
            <p className="mt-4 leading-relaxed text-ink">{listing.description}</p>
          )}
          {listing.kind !== "extra" && (
            <AllergenInfo listing={listing} />
          )}
          {listing.ingredients && (
            <p className="mt-3 text-sm">
              <span className="font-medium text-ink">Ingredients:</span>{" "}
              <span className="text-muted">{listing.ingredients}</span>
            </p>
          )}
          {listing.kind !== "extra" && (
            <div className="mt-4">
              <AvailabilityPill listing={listing} today={today} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
            {listing.served_hot && (
              <span className="rounded-full bg-line px-3 py-1">Served hot</span>
            )}
            {cook.pickup_available && (
              <span className="rounded-full bg-line px-3 py-1">Pickup</span>
            )}
            {cook.delivery_available && (
              <span className="rounded-full bg-line px-3 py-1">Delivery</span>
            )}
          </div>

          <div className="mt-6">
            {soldOut ? (
              <SoldOutTag />
            ) : !orderable ? (
              <span className="inline-block rounded-full bg-line/60 px-4 py-2 text-sm font-medium text-muted">
                Ordering closed for now
              </span>
            ) : hasOptions ? (
              <OptionsPicker
                cook={{
                  id: cook.id,
                  name: cook.business_name,
                  slug: cook.slug,
                  pickupAvailable: cook.pickup_available,
                  deliveryAvailable: cook.delivery_available,
                  pickupWindows: cook.pickup_windows ?? [],
                }}
                listingId={listing.id}
                title={listing.title}
                basePriceCents={listing.price_cents}
                photoUrl={listing.photo_url}
                groups={optionGroups}
              />
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
                  listingId: listing.id,
                  title: listing.title,
                  priceCents: listing.price_cents,
                  photoUrl: listing.photo_url,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

// Dish-level allergen disclosure. Deliberately framed as the COOK'S report, not
// a safety guarantee — a home kitchen is a high cross-contact environment, so a
// declared list is never phrased as "allergen-free" and always carries the
// cross-contact caution at the point of decision. A dish with allergens_declared
// = false (legacy, pre-checklist) shows "not listed — ask the chef", NEVER an
// implied all-clear.
function AllergenInfo({ listing }: { listing: any }) {
  const contains = allergenLabels(listing.contains);

  if (!listing.allergens_declared) {
    return (
      <div className="mt-4 rounded-lg border border-line bg-card/40 p-3 text-sm">
        {listing.allergens ? (
          <p>
            <span className="font-medium text-ink">Contains:</span>{" "}
            <span className="text-muted">{listing.allergens}</span>
          </p>
        ) : (
          <p className="text-muted">
            Allergen info not listed — message the chef before ordering.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-line bg-card/40 p-3 text-sm">
      {contains.length > 0 ? (
        <p>
          <span className="font-medium text-ink">Contains:</span>{" "}
          <span className="text-muted">{contains.join(", ")}</span>
        </p>
      ) : listing.allergens || listing.ingredients ? (
        // The cook checked none of the listed allergens, but wrote free-text
        // notes/ingredients that may name one not on the checklist (coconut,
        // mustard…). Don't render an absolute "contains none" all-clear here —
        // point at the details instead.
        <p className="text-muted">
          The cook checked none of the listed major allergens — see the notes
          and ingredients below.
        </p>
      ) : (
        <p className="text-muted">
          The cook reports this dish contains none of the listed major
          allergens.
        </p>
      )}
      {listing.allergens && (
        <p className="mt-1">
          <span className="font-medium text-ink">Notes:</span>{" "}
          <span className="text-muted">{listing.allergens}</span>
        </p>
      )}
      <p className="mt-2 text-xs text-faint">
        Made in a home kitchen — cross-contact with other allergens is possible.
        If you have a serious allergy, message the chef before ordering.
      </p>
    </div>
  );
}
