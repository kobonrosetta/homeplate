"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PICKUP_LINES } from "@/lib/constants";
import {
  addDaysIso,
  datedPickupWindowDate,
  formatDateShort,
  pacificTodayIso,
} from "@/lib/availability";
import {
  holidaysForYear,
  holidayPickupLine,
  holidayPickupLines,
} from "@/lib/holidays";

// "Add a holiday pickup day" under the pickup-times box in Settings. It writes
// a dated line ("Thanksgiving pickup: Wed, Nov 25, 2026 · 2PM-5PM") into that
// box, which the cook then saves with the rest of the form — so the box stays
// the single source of truth, and deleting the lines removes the day. Left at
// the usual hours, the day copies how the kitchen already works, exactly like
// the dashboard's one-tap button: its slot times listed under the date line
// when it uses slots.
export default function HolidayPickupAdder({
  defaultHours,
}: {
  defaultHours: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [today, setToday] = useState("");
  const [date, setDate] = useState("");
  const [hours, setHours] = useState(defaultHours);
  const [label, setLabel] = useState("Holiday pickup");
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setToday(pacificTodayIso()), []);

  // Name the day after the holiday it serves, when it's within a few days of one.
  function pickDate(d: string) {
    setDate(d);
    setNote(null);
    if (!d) return;
    const y = Number(d.slice(0, 4));
    const h = holidaysForYear(y).find(
      (x) => d >= addDaysIso(x.date, -3) && d <= x.date
    );
    setLabel(h ? h.label : "Holiday pickup");
  }

  function add() {
    const box = wrap.current
      ?.closest("form")
      ?.querySelector<HTMLTextAreaElement>('textarea[name="pickup_windows"]');
    if (!box || !date) return;
    const lines = box.value.split("\n").map((s) => s.trim()).filter(Boolean);
    const now = today || pacificTodayIso();
    if (lines.some((l) => datedPickupWindowDate(l, now) === date)) {
      setNote("That day is already in your pickup times.");
      return;
    }
    const name = label.trim() || "Holiday pickup";
    const typed = hours.trim();
    const oneLine = [holidayPickupLine(name, date, typed || "time to be confirmed")];
    let added =
      typed === defaultHours.trim() ? holidayPickupLines(name, date, lines) : oneLine;
    if (lines.length + added.length > MAX_PICKUP_LINES) added = oneLine;
    if (lines.length + added.length > MAX_PICKUP_LINES) {
      setNote(
        `Pickup times hold up to ${MAX_PICKUP_LINES} lines. Remove a few above first.`
      );
      return;
    }
    box.value = [...lines, ...added].join("\n");
    setNote(
      added.length > 1
        ? `Added ${formatDateShort(date)} with your usual pickup times. Press Save at the bottom to make it live.`
        : "Added. Press Save at the bottom to make it live."
    );
  }

  return (
    <div ref={wrap} className="mt-2">
      <details className="rounded-lg border border-line bg-card px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-brand">
          + Add a holiday pickup day
        </summary>
        <p className="mt-2 text-xs text-muted">
          A one-time pickup day, like the day before Thanksgiving. Buyers can
          choose it at checkout, it doesn&apos;t change your weekly schedule,
          and it disappears after the date.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-ink">Date</span>
            <input
              type="date"
              min={today ? addDaysIso(today, 1) : undefined}
              value={date}
              onChange={(e) => pickDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink">Hours</span>
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="2PM-5PM"
              maxLength={30}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink">Name</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={24}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={!date}
          className="mt-3 rounded-full border border-brand px-4 py-1.5 text-sm font-medium text-brand hover:bg-brand/10 disabled:opacity-50"
        >
          Add to pickup times
        </button>
        {note && <p className="mt-2 text-xs text-muted">{note}</p>}
      </details>
    </div>
  );
}
