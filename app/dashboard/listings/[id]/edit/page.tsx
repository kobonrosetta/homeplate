import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { updateListing } from "../../actions";
import NewListingForm from "@/components/new-listing-form";

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const { cook } = await getCurrentCook();
  if (!cook) redirect("/sell");

  const supabase = createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", params.id)
    .eq("cook_id", cook.id)
    .maybeSingle();

  if (!listing) notFound();

  return (
    <div className="max-w-xl">
      <Link href="/dashboard/menu" className="text-sm text-muted hover:text-ink">
        ← Back to menu
      </Link>
      <h2 className="mt-2 text-lg font-semibold text-ink">Edit listing</h2>

      {listing.photo_url && (
        <div className="mt-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={listing.photo_url}
            alt=""
            className="h-16 w-16 rounded-lg object-cover"
          />
          <span className="text-sm text-muted">
            Current photo — upload a new one below to replace it.
          </span>
        </div>
      )}

      <NewListingForm
        action={updateListing}
        error={searchParams.error}
        hiddenId={listing.id}
        submitLabel="Save changes"
        defaults={{
          title: listing.title,
          category: listing.category,
          price: (listing.price_cents / 100).toFixed(2),
          quantity: String(listing.quantity_available),
          limited: listing.limited_quantity,
          allergens: listing.allergens ?? "",
          description: listing.description ?? "",
          leadTime: listing.lead_time_note ?? "",
        }}
      />
    </div>
  );
}
