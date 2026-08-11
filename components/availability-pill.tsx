import {
  availabilityBadge,
  availabilityFromListing,
  pacificTodayIso,
  parsePickupDays,
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
// chip ("Get it today" / "Get it Sat, Aug 15" / "Get it Sat, Aug 22 · order by
// Aug 21" / "Ordering closed"). Pass the kitchen's `pickupWindows` so the date
// reflects when the buyer can actually RECEIVE the dish, not just when it can
// be made. `today` can be passed to avoid recomputing.
export default function AvailabilityPill({
  listing,
  today,
  pickupWindows,
  className = "",
}: {
  listing: {
    fulfillment_mode?: string | null;
    lead_days?: number | null;
    ready_date?: string | null;
    order_by?: string | null;
  };
  today?: string;
  pickupWindows?: string[] | null;
  className?: string;
}) {
  const badge = availabilityBadge(
    availabilityFromListing(listing),
    today ?? pacificTodayIso(),
    parsePickupDays(pickupWindows)
  );
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[badge.tone]} ${className}`}
    >
      {badge.text}
    </span>
  );
}
