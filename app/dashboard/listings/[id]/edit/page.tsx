import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { updateListing, saveListingOptions } from "../../actions";
import NewListingForm from "@/components/new-listing-form";
import OptionsEditor from "@/components/options-editor";
import { MAX_GROUPS_PER_LISTING, MAX_OPTIONS_PER_GROUP } from "@/lib/options";
import { taxRateForCity } from "@/lib/tax";

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; saved?: string };
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

  const { data: groups } = await supabase
    .from("listing_option_groups")
    .select("id, name, sort_order, listing_options(id, name, price_delta_cents, sort_order)")
    .eq("listing_id", listing.id)
    .order("sort_order", { ascending: true });

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
            Current photo. Upload a new one below to replace it.
          </span>
        </div>
      )}

      <NewListingForm
        action={updateListing}
        error={searchParams.error}
        hiddenId={listing.id}
        submitLabel="Save changes"
        servedHotUI={cook.operation_type === "mehko"}
        taxRate={taxRateForCity(cook.city)}
        taxPlace={cook.city?.trim() || "Santa Clara County"}
        defaults={{
          title: listing.title,
          category: listing.category,
          price: (listing.price_cents / 100).toFixed(2),
          quantity: String(listing.quantity_available),
          limited: listing.limited_quantity,
          allergens: listing.allergens ?? "",
          contains: listing.contains ?? [],
          mayContain: listing.may_contain ?? [],
          declared: !!listing.allergens_declared,
          ingredients: listing.ingredients ?? "",
          description: listing.description ?? "",
          servedHot: !!listing.served_hot,
          isExtra: listing.kind === "extra",
          fulfillmentMode: listing.fulfillment_mode ?? "ready_now",
          leadDays: listing.lead_days,
          readyDate: listing.ready_date,
          orderBy: listing.order_by,
        }}
      />

      <div className="mt-10 border-t border-line pt-6">
        <h3 className="text-lg font-semibold text-ink">Item options</h3>
        <p className="mt-1 text-sm text-muted">
          Add dropdowns buyers choose from (sizes, characters, stamps). Each
          choice can add to the price. Your item price above is the base.
        </p>
        {searchParams.saved === "options" && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            ✓ Options saved
          </p>
        )}
        <OptionsEditor
          listingId={listing.id}
          action={saveListingOptions}
          maxGroups={MAX_GROUPS_PER_LISTING}
          maxOptions={MAX_OPTIONS_PER_GROUP}
          initial={(groups ?? []).map((g: any) => ({
            name: g.name,
            options: [...(g.listing_options ?? [])]
              .sort((a: any, b: any) => a.sort_order - b.sort_order)
              .map((o: any) => ({
                name: o.name,
                priceDelta: (o.price_delta_cents / 100).toFixed(2).replace(/\.00$/, ""),
              })),
          }))}
        />
      </div>
    </div>
  );
}
