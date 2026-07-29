"use client";

import { useState } from "react";

const INPUT =
  "mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line";

// Where a buyer actually picks up — never shown before they order (same rule
// as the home address; both live in cook_private). Two plain choices, not a
// toggle-plus-field to reason about: pick up at the address above, or meet
// somewhere else. Submits `pickup_mode` (so the server can validate) and
// `pickup_location` (the meetup spot text, only meaningful when mode is
// "elsewhere").
export default function PickupLocationField({
  defaultValue = "",
  homeAddress = "",
}: {
  defaultValue?: string;
  homeAddress?: string;
}) {
  const [mode, setMode] = useState<"home" | "elsewhere">(
    defaultValue.trim() ? "elsewhere" : "home"
  );
  const [location, setLocation] = useState(defaultValue);

  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <p className="text-sm font-medium text-ink">
        Where do buyers pick up their order?
      </p>
      <p className="text-xs text-faint">
        Only shared with a buyer after they order — never shown on your public
        page.
      </p>

      <label className="flex items-start gap-3">
        <input
          type="radio"
          name="pickup_mode"
          value="home"
          checked={mode === "home"}
          onChange={() => setMode("home")}
          className="mt-1 h-4 w-4"
        />
        <span className="text-sm">
          <span className="font-medium text-ink">My home address</span>
          {homeAddress.trim() && (
            <span className="block text-xs text-muted">{homeAddress}</span>
          )}
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="radio"
          name="pickup_mode"
          value="elsewhere"
          checked={mode === "elsewhere"}
          onChange={() => setMode("elsewhere")}
          className="mt-1 h-4 w-4"
        />
        <span className="text-sm">
          <span className="font-medium text-ink">Meet somewhere else</span>
          <span className="block text-xs text-muted">
            A park, a store parking lot — anywhere that isn&apos;t your home.
          </span>
        </span>
      </label>

      {mode === "elsewhere" && (
        <input
          name="pickup_location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Sunnyvale Library parking lot, 1 W Olive Ave"
          required
          className={INPUT}
        />
      )}
    </div>
  );
}
