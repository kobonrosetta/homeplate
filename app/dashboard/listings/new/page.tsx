import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCook } from "@/lib/cook";
import { taxRateForCity } from "@/lib/tax";
import { createListing } from "../actions";
import NewListingForm from "@/components/new-listing-form";

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { cook } = await getCurrentCook();
  if (!cook) redirect("/sell");

  return (
    <div className="max-w-xl">
      <Link href="/dashboard/menu" className="text-sm text-muted hover:text-ink">
        ← Back to menu
      </Link>
      <h2 className="mt-2 text-lg font-semibold text-ink">Add an item</h2>
      <NewListingForm
        action={createListing}
        error={searchParams.error}
        servedHotUI={cook.operation_type === "mehko"}
        taxRate={taxRateForCity(cook.city)}
        taxPlace={cook.city?.trim() || "Santa Clara County"}
        defaults={{
          // New dishes inherit the kitchen's default availability (overridable).
          fulfillmentMode: cook.default_fulfillment_mode ?? "ready_now",
          leadDays: cook.default_lead_days,
        }}
      />
    </div>
  );
}
