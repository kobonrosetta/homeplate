import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/constants";
import AddToCart from "@/components/add-to-cart";
import FeeNote from "@/components/fee-note";
import PhotoGallery from "@/components/photo-gallery";
import OptionsPicker from "@/components/options-picker";

export const dynamic = "force-dynamic";

// A dish link shared in a group chat should unfurl as the dish: photo, name,
// kitchen, price — a menu item, not a bare URL.
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select(
      "title, description, price_cents, photo_url, cooks!inner(business_name, status)"
    )
    .eq("id", params.id)
    .eq("is_available", true)
    .maybeSingle();
  const cook: any = Array.isArray(listing?.cooks)
    ? listing?.cooks[0]
    : listing?.cooks;
  if (!listing || !cook || cook.status !== "active") return {};

  const title = `${listing.title} — ${cook.business_name}`;
  const description = (
    listing.description ||
    `${formatUsd(listing.price_cents)} · homemade by a county-permitted kitchen on HomePlate.`
  ).slice(0, 200);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "HomePlate",
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
  const { data: listing } = await supabase
    .from("listings")
    .select(
      "*, cooks!inner(id, business_name, slug, city, permit_verified, status, pickup_available, delivery_available, pickup_windows)"
    )
    .eq("id", params.id)
    .eq("is_available", true)
    .maybeSingle();

  if (!listing) notFound();
  const cook = Array.isArray(listing.cooks) ? listing.cooks[0] : listing.cooks;
  if (!cook || cook.status !== "active") notFound();

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
  const galleryUrls = [listing.photo_url, ...(listing.photo_urls ?? [])].filter(
    Boolean
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/browse" className="text-sm text-muted hover:text-ink">
        ← Back to browse
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
              from {formatUsd(listing.price_cents)} — choose your options below
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
            {cook.permit_verified ? " · ✓ Verified" : ""}
            {cook.city ? ` · ${cook.city}` : ""}
          </Link>

          {listing.description && (
            <p className="mt-4 leading-relaxed text-ink">{listing.description}</p>
          )}
          {listing.allergens && (
            <p className="mt-3 text-sm">
              <span className="font-medium text-ink">Contains:</span>{" "}
              <span className="text-muted">{listing.allergens}</span>
            </p>
          )}
          {listing.lead_time_note && (
            <p className="mt-3 text-sm text-faint">{listing.lead_time_note}</p>
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
              <span className="inline-block rounded-full bg-line px-5 py-2.5 text-sm font-medium text-faint">
                Sold out
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
