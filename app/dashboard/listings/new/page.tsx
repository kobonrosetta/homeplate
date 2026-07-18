import Link from "next/link";
import { createListing } from "../actions";
import NewListingForm from "@/components/new-listing-form";

export default function NewListingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="max-w-xl">
      <Link href="/dashboard/menu" className="text-sm text-muted hover:text-ink">
        ← Back to menu
      </Link>
      <h2 className="mt-2 text-lg font-semibold text-ink">Add a listing</h2>
      <NewListingForm action={createListing} error={searchParams.error} />
    </div>
  );
}
