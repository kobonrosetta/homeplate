// Holiday pickup days: which food holidays are coming up, which handoff dates
// to suggest for each, and whether a kitchen's schedule already covers them.
// Pure date math on "YYYY-MM-DD" strings (Pacific calendar days), unit-tested.
import {
  activePickupWindows,
  addDaysIso,
  datedPickupWindowDate,
  formatDateShort,
  isoDayOfWeek,
  parsePickupDays,
  pickupBlocks,
  pickupSlotsLabel,
} from "@/lib/availability";

export type Holiday = {
  key: string; // "thanksgiving-2026" — one email per kitchen per key
  name: string; // "Thanksgiving"
  date: string; // the holiday itself
  label: string; // prefix for the pickup line: "Thanksgiving pickup"
  suggestions: string[]; // handoff dates to offer, in order
};

// The nth (1-based) given weekday (0 = Sunday) of a month.
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const offset = (weekday - isoDayOfWeek(first) + 7) % 7;
  return addDaysIso(first, offset + (n - 1) * 7);
}

// The big food holidays people order ahead for. Thanksgiving is the fourth
// Thursday of November; the suggestions are the days families actually pick
// food up — the day before, or the morning of.
export function holidaysForYear(year: number): Holiday[] {
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  return [
    {
      key: `thanksgiving-${year}`,
      name: "Thanksgiving",
      date: thanksgiving,
      label: "Thanksgiving pickup",
      suggestions: [addDaysIso(thanksgiving, -1), thanksgiving],
    },
    {
      key: `christmas-${year}`,
      name: "Christmas",
      date: `${year}-12-25`,
      label: "Christmas pickup",
      suggestions: [`${year}-12-23`, `${year}-12-24`],
    },
    {
      key: `new-years-eve-${year}`,
      name: "New Year's Eve",
      date: `${year}-12-31`,
      label: "New Year's Eve pickup",
      suggestions: [`${year}-12-30`, `${year}-12-31`],
    },
  ];
}

// Holidays between 2 and `withinDays` days away, soonest first.
export function upcomingHolidays(todayIso: string, withinDays = 42): Holiday[] {
  const y = Number(todayIso.slice(0, 4));
  const horizon = addDaysIso(todayIso, withinDays);
  return [...holidaysForYear(y), ...holidaysForYear(y + 1)].filter(
    (h) => h.date >= addDaysIso(todayIso, 2) && h.date <= horizon
  );
}

// The holiday a kitchen should be asked about, with the suggested dates its
// schedule doesn't already offer — or null. A holiday counts as handled once
// the kitchen has ANY dated pickup day in the few days before it (they made
// their call), or when every suggestion already falls on a weekly pickup day.
// A kitchen with no pickup times at all is never asked: its buyers already
// pick any date and suggest a time at checkout.
export function holidayNudge(
  windows: string[] | null | undefined,
  todayIso: string,
  withinDays = 42
): { holiday: Holiday; suggestions: string[] } | null {
  if (activePickupWindows(windows, todayIso).length === 0) return null;
  const weekly = parsePickupDays(windows);
  const dated = (windows ?? [])
    .map((w) => datedPickupWindowDate(w, todayIso))
    .filter((d): d is string => !!d);
  for (const h of upcomingHolidays(todayIso, withinDays)) {
    if (dated.some((d) => d >= addDaysIso(h.date, -3) && d <= h.date)) continue;
    const open = h.suggestions.filter(
      (d) => d > todayIso && !(weekly && weekly.has(isoDayOfWeek(d)))
    );
    if (open.length > 0) return { holiday: h, suggestions: open };
  }
  return null;
}

// A kitchen's usual pickup hours, from its first weekly line that has any:
// "Saturdays 2PM-5PM" → hours "2PM-5PM"; "Saturdays" with slot times listed
// under it → those slots, and hours "2 PM to 5:30 PM". Null when no weekly
// line has readable hours.
const DAY_WORDS =
  /\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)s?\b|\b(weekends?|weekdays?|daily|every ?day|all week|any ?day)\b/gi;
function usualPickup(
  windows: string[] | null | undefined
): { hours: string; slots: string[] | null } | null {
  for (const b of pickupBlocks(windows)) {
    if (b.dated) continue;
    if (b.slots.length) return { hours: pickupSlotsLabel(b.slots), slots: b.slots };
    const hours = b.line
      .replace(DAY_WORDS, " ")
      // Separators go, but a colon or dot inside a time ("2:30") stays.
      .replace(/[&,;|·]+/g, " ")
      .replace(/(^|\s)[:.]+|[:.]+(?=\s|$)/g, "$1 ")
      .replace(/\s+/g, " ")
      .trim();
    if (/\d/.test(hours)) return { hours, slots: null };
  }
  return null;
}

// A kitchen's usual hours as one phrase, for "It uses your usual pickup
// times (…)".
export function weeklyPickupHours(windows: string[] | null | undefined): string | null {
  return usualPickup(windows)?.hours.slice(0, 30) ?? null;
}

// The pickup line for a holiday day, in the dated format the parser reads:
// "Thanksgiving pickup: Wed, Nov 25, 2026 · 2PM-5PM" (always under the
// 80-character limit pickup lines are saved with).
export function holidayPickupLine(label: string, dateIso: string, hours: string): string {
  const day = `${formatDateShort(dateIso)}, ${dateIso.slice(0, 4)}`;
  return `${label.slice(0, 24)}: ${day} · ${hours.slice(0, 30)}`.slice(0, 80);
}

// The lines a one-tap holiday day adds, matching how the kitchen already
// works: a kitchen that lists slot times gets the same slots on the holiday
// ("Thanksgiving pickup: Wed, Nov 25, 2026", then "2 PM", "2:30 PM", …);
// otherwise one line at its usual hours.
export function holidayPickupLines(
  label: string,
  dateIso: string,
  windows: string[] | null | undefined
): string[] {
  const usual = usualPickup(windows);
  if (usual?.slots) {
    const day = `${formatDateShort(dateIso)}, ${dateIso.slice(0, 4)}`;
    return [`${label.slice(0, 24)}: ${day}`, ...usual.slots];
  }
  return [
    holidayPickupLine(label, dateIso, usual?.hours ?? "time to be confirmed"),
  ];
}
