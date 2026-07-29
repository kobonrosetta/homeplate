"use client";

import { useState } from "react";

const INPUT =
  "mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line";

// Bundles the pickup LOCATION with its VISIBILITY into one plain-English choice
// so a cook never has to reason about separate toggles. Submits `pickup_location`
// — empty when Private (home revealed only after an order), the typed string
// when Public (a meetup spot, or their home if they choose). `homeAddress` (the
// cook's own private street+city, on their own settings page) powers the
// "use my home address" convenience.
export default function PickupLocationField({
  defaultValue = "",
  homeAddress = "",
}: {
  defaultValue?: string;
  homeAddress?: string;
}) {
  const [mode, setMode] = useState<"private" | "public">(
    defaultValue.trim() ? "public" : "private"
  );
  const [location, setLocation] = useState(defaultValue);

  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <p className="text-sm font-medium text-ink">Where do buyers pick up?</p>

      <label className="flex items-start gap-3">
        <input
          type="radio"
          name="pickup_mode"
          checked={mode === "private"}
          onChange={() => setMode("private")}
          className="mt-1 h-4 w-4"
        />
        <span className="text-sm">
          <span className="font-medium text-ink">Keep it private</span>{" "}
          <span className="text-faint">· recommended</span>
          <span className="block text-xs text-muted">
            Buyers see your neighborhood, and the exact address only after they
            order.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="radio"
          name="pickup_mode"
          checked={mode === "public"}
          onChange={() => setMode("public")}
          className="mt-1 h-4 w-4"
        />
        <span className="text-sm">
          <span className="font-medium text-ink">Show a pickup spot</span>
          <span className="block text-xs text-muted">
            Listed on your page so shoppers see exactly where you are — great
            for a public meetup spot that keeps your home private.
          </span>
        </span>
      </label>

      {mode === "public" ? (
        <div>
          <input
            name="pickup_location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Sunnyvale Library parking lot, 1 W Olive Ave"
            className={INPUT}
          />
          {homeAddress.trim() && (
            <button
              type="button"
              onClick={() => setLocation(homeAddress)}
              className="mt-1.5 text-xs font-medium text-brand hover:underline"
            >
              Use my home address
            </button>
          )}
        </div>
      ) : (
        // Private → still submit the field (empty) so a save clears any old spot.
        <input type="hidden" name="pickup_location" value="" />
      )}
    </div>
  );
}
