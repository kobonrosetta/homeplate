import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/constants";
import AddToCart from "@/components/add-to-cart";
import FeeNote from "@/components/fee-note";
import PhotoGallery from "@/components/photo-gallery";

export const dynamic = "force-dynamic";

export default async function ListingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select(
      "*, cooks!inner(id, business_name, slug, city, permit_verified, status, pickup_available, delivery_available)"
    )
    .eq("id", params.id)
    .eq("is_available", true)
    .maybeSingle();

  if (!listing) notFound();
  const cook = Array.isArray(listing.cooks) ? listing.cooks[0] : listing.cooks;
  if (!cook || cook.status !== "active") notFound();

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
          <p className="mt-1 text-xl font-semibold text-ink">
            {formatUsd(listing.price_cents)}
          </p>
          <FeeNote priceCents={listing.price_cents} className="mt-1" />
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
