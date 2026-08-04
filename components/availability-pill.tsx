import {
  availabilityBadge,
  availabilityFromListing,
  pacificTodayIso,
} from "@/lib/availability";

// Tone → warm-editorial pill colors, matching the verified badge / "Only N left"
// treatment. Kept subtle on purpose.
const TONE: Record<string, string> = {
  now: "border-emerald-200 bg-emerald-50 text-emerald-800",
  soon: "border-amber-200 bg-amber-50 text-amber-800",
  date: "border-brand/20 bg-brand/10 text-brand",
  closed: "border-line bg-line/60 text-muted",
};

// Reads a listing's availability columns and renders the buyer-facing timing
// chip ("Ready today" / "Ready by Sat, Aug 9" / "For Sat, Aug 9 · order by
// Aug 7" / "Ordering closed"). `today` can be passed to avoid recomputing.
export default function AvailabilityPill({
  listing,
  today,
  className = "",
}: {
  listing: {
    fulfillment_mode?: string | null;
    lead_days?: number | null;
    ready_date?: string | null;
    order_by?: string | null;
  };
  today?: string;
  className?: string;
}) {
  const badge = availabilityBadge(
    availabilityFromListing(listing),
    today ?? pacificTodayIso()
  );
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[badge.tone]} ${className}`}
    >
      {badge.text}
    </span>
  );
}
