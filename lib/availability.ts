// Dish availability / timing model (see supabase/add-listing-availability.sql).
//
// Every dish answers ONE required question — "when can people get this?" — with
// a mode that always resolves to a concrete calendar DATE the checkout enforces.
// This is the guardrail that makes it impossible to pay for food that isn't
// planned to be made: the server computes ready-by from the mode and refuses any
// order it can't turn into a valid, near-term date.
//
//   ready_now  → today (also the "available now / ASAP" signal)
//   lead_time  → today + lead_days (recomputed every order, so "weeks out" is
//                structurally impossible — the number is added to TODAY)
//   preorder   → a fixed ready_date, sellable only until an order_by cutoff
//
// DATE-ONLY math on purpose: we work in "YYYY-MM-DD" strings anchored to Pacific
// (California), never timestamps. String compare == chronological compare, and
// calendar add via UTC-noon dodges DST. Kept pure (callers pass `todayIso`) so
// the boundaries are unit-tested next to the fee/tax math.

import { MAX_LEAD_DAYS, MAX_PREORDER_HORIZON_DAYS } from "@/lib/constants";

const PT_TZ = "America/Los_Angeles";

export type FulfillmentMode = "ready_now" | "lead_time" | "preorder";

export const FULFILLMENT_MODES: FulfillmentMode[] = [
  "ready_now",
  "lead_time",
  "preorder",
];

export interface Availability {
  mode: FulfillmentMode;
  leadDays?: number | null; // lead_time only
  readyDate?: string | null; // preorder only, "YYYY-MM-DD"
  orderBy?: string | null; // preorder cutoff, "YYYY-MM-DD" (defaults to readyDate)
}

// Map a listing row's snake_case availability columns to an Availability. One
// place so the checkout guard, listing/kitchen pages, and the pill can't drift.
export function availabilityFromListing(l: {
  fulfillment_mode?: string | null;
  lead_days?: number | null;
  ready_date?: string | null;
  order_by?: string | null;
}): Availability {
  return {
    mode: (l.fulfillment_mode as FulfillmentMode) ?? "ready_now",
    leadDays: l.lead_days,
    readyDate: l.ready_date,
    orderBy: l.order_by,
  };
}

// Today's calendar date in California, as "YYYY-MM-DD". en-CA formats exactly
// that shape. Callers in server code pass no arg; tests pass a fixed instant.
export function pacificTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Add n calendar days to a "YYYY-MM-DD" date. Anchored at UTC noon so a DST
// transition can never bump the result across a day boundary.
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d, 12) + n * 86400000;
  const dt = new Date(t);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

// Valid "YYYY-MM-DD"? (cheap shape + round-trip check)
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

function clampLead(n: unknown): number {
  const v = typeof n === "number" ? n : parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(Math.floor(v), MAX_LEAD_DAYS);
}

// The concrete "you'll get it by" date, or null if this dish can't currently
// produce one (a preorder past its cutoff / with a bad date). String-comparable.
export function computeReadyBy(
  a: Availability,
  todayIso: string
): string | null {
  switch (a.mode) {
    case "ready_now":
      return todayIso;
    case "lead_time":
      // Mirror isOrderable: a malformed lead (null / out of range) yields no
      // date, so the two never disagree.
      return isOrderable(a, todayIso)
        ? addDaysIso(todayIso, clampLead(a.leadDays))
        : null;
    case "preorder":
      return isOrderable(a, todayIso) ? a.readyDate ?? null : null;
    default:
      return null;
  }
}

// Can a buyer order this dish RIGHT NOW on timing grounds alone? (Stock and the
// is_available OOO toggle are checked separately.) This is the guard the
// checkout server action leans on to make bad orders impossible.
export function isOrderable(a: Availability, todayIso: string): boolean {
  switch (a.mode) {
    case "ready_now":
      return true;
    case "lead_time": {
      const n = a.leadDays;
      return typeof n === "number" && n >= 0 && n <= MAX_LEAD_DAYS;
    }
    case "preorder": {
      if (!isIsoDate(a.readyDate)) return false;
      const readyDate = a.readyDate as string;
      const orderBy = isIsoDate(a.orderBy) ? (a.orderBy as string) : readyDate;
      const horizon = addDaysIso(todayIso, MAX_PREORDER_HORIZON_DAYS);
      // Open only while: not past the cutoff, the ready date isn't in the past,
      // and it's within the far-future ceiling.
      return todayIso <= orderBy && readyDate >= todayIso && readyDate <= horizon;
    }
    default:
      return false;
  }
}

// Parse the availability fields off a submitted listing form into DB-ready
// values, keeping only fields relevant to the chosen mode. Extras (kind !==
// 'dish') aren't food and are forced to ready_now with no timing.
export function readAvailabilityFromForm(
  formData: FormData,
  kind: "dish" | "extra"
): {
  fulfillment_mode: FulfillmentMode;
  lead_days: number | null;
  ready_date: string | null;
  order_by: string | null;
} {
  if (kind !== "dish") {
    return { fulfillment_mode: "ready_now", lead_days: null, ready_date: null, order_by: null };
  }
  const raw = String(formData.get("fulfillment_mode") ?? "ready_now");
  const mode: FulfillmentMode = (FULFILLMENT_MODES as string[]).includes(raw)
    ? (raw as FulfillmentMode)
    : "ready_now";

  if (mode === "lead_time") {
    return {
      fulfillment_mode: "lead_time",
      lead_days: clampLead(formData.get("lead_days")),
      ready_date: null,
      order_by: null,
    };
  }
  if (mode === "preorder") {
    const readyDate = String(formData.get("ready_date") ?? "").trim();
    const orderByRaw = String(formData.get("order_by") ?? "").trim();
    const orderBy = isIsoDate(orderByRaw) ? orderByRaw : readyDate;
    return {
      fulfillment_mode: "preorder",
      lead_days: null,
      ready_date: isIsoDate(readyDate) ? readyDate : null,
      order_by: isIsoDate(orderBy) ? orderBy : null,
    };
  }
  return { fulfillment_mode: "ready_now", lead_days: null, ready_date: null, order_by: null };
}

// Server-side validation on save. Returns an error message, or null if OK.
// (The UI also constrains inputs; this is the authoritative gate.)
export function validateAvailability(
  a: Availability,
  todayIso: string
): string | null {
  if (a.mode === "lead_time") {
    const n = a.leadDays;
    if (typeof n !== "number" || n < 0 || n > MAX_LEAD_DAYS) {
      return `Lead time must be between 0 and ${MAX_LEAD_DAYS} days.`;
    }
    return null;
  }
  if (a.mode === "preorder") {
    if (!isIsoDate(a.readyDate)) return "Pick the date this dish will be ready.";
    const readyDate = a.readyDate as string;
    if (readyDate < todayIso) return "The ready date can't be in the past.";
    if (readyDate > addDaysIso(todayIso, MAX_PREORDER_HORIZON_DAYS)) {
      return `Ready date can be at most ${MAX_PREORDER_HORIZON_DAYS} days out. For further-out orders, send the buyer a payment link instead.`;
    }
    const orderBy = isIsoDate(a.orderBy) ? (a.orderBy as string) : readyDate;
    if (orderBy < todayIso)
      return "The order-by cutoff can't be in the past — the dish would never take an order.";
    if (orderBy > readyDate) return "The order-by cutoff can't be after the ready date.";
    return null;
  }
  return null; // ready_now: always valid
}

// ---- Kitchen handoff days ----
//
// A dish being READY says nothing about when the buyer can RECEIVE it — a
// weekend-only kitchen makes "Ready today" true and useless on a Tuesday.
// Pickup windows are cook-typed free text ("Saturdays 11AM-10 PM"), so we
// conservatively parse day-of-week names out of them. If ANY window has no
// recognizable day, the whole schedule is treated as unknown (null) and every
// surface falls back to plain ready-by behavior — parsing failure can never
// block ordering or invent a wrong day.

// One day-name token (Sun…Sat, with common abbreviations), as a reusable
// source string so the range regex below can compose two of them.
const DAY_SRC =
  "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)s?";
const DAY_NUM: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};
const dayNum = (token: string) => DAY_NUM[token.slice(0, 3).toLowerCase()];

// Schedules the weekly-day model CANNOT represent: monthly/alternating
// frequencies and negations ("1st Saturday", "every other Sat", "closed
// Sundays", "except Mondays"). A bare day-token scan would confidently invent
// weekly handoff days from these — the one thing worse than not parsing — so
// any such marker makes the WHOLE schedule unknown (null → old behavior).
const UNPARSEABLE_QUALIFIER =
  /\b(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last|every other|alternat\w*|bi-?weekly|monthly|no|not|closed|except\w*|excluding)\b/i;

export function parsePickupDays(
  windows: string[] | null | undefined
): Set<number> | null {
  if (!windows || windows.length === 0) return null;
  const days = new Set<number>();
  for (const w of windows) {
    let t = (w ?? "").toLowerCase();
    if (UNPARSEABLE_QUALIFIER.test(t)) return null;
    let found = false;

    // Day RANGES first — "Mon-Fri", "Tue – Sat", "Thurs through Sunday" —
    // expanded inclusively (walking forward mod 7, so "Fri-Mon" works too).
    // Matched ranges are blanked out so the endpoint tokens aren't re-counted.
    const rangeRe = new RegExp(
      `\\b${DAY_SRC}\\s*(?:-|–|—|to|through|thru|till|until)\\s*${DAY_SRC}\\b`,
      "gi"
    );
    t = t.replace(rangeRe, (_m, startTok: string, endTok: string) => {
      let d = dayNum(startTok);
      const end = dayNum(endTok);
      for (let i = 0; i < 7; i++) {
        days.add(d);
        if (d === end) break;
        d = (d + 1) % 7;
      }
      found = true;
      return " ";
    });

    if (/\bweekends?\b/.test(t)) {
      days.add(6);
      days.add(0);
      found = true;
    }
    if (/\bweekdays?\b/.test(t)) {
      for (const d of [1, 2, 3, 4, 5]) days.add(d);
      found = true;
    }
    if (/\b(daily|every ?day|all week|any ?day)\b/.test(t)) {
      for (let d = 0; d < 7; d++) days.add(d);
      found = true;
    }
    for (const m of t.matchAll(new RegExp(`\\b${DAY_SRC}\\b`, "gi"))) {
      days.add(dayNum(m[1]));
      found = true;
    }
    if (!found) return null; // one unreadable window → schedule unknown
  }
  return days.size ? days : null;
}

// Day-of-week (0=Sun) for a "YYYY-MM-DD" string, DST-proof via UTC noon.
export function isoDayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

// First date >= startIso that falls on one of `days`. Bounded lookahead — a
// 7-day week means 7 steps always suffice; null only for an empty set.
export function nextHandoffIso(
  startIso: string,
  days: Set<number>
): string | null {
  let cur = startIso;
  for (let i = 0; i < 8; i++) {
    if (days.has(isoDayOfWeek(cur))) return cur;
    cur = addDaysIso(cur, 1);
  }
  return null;
}

// The date the buyer can actually RECEIVE the dish — the ready-by date pushed
// forward to the kitchen's next handoff day. This is the ONE number every
// buyer surface shows ("Get it Saturday"), so glance/cart/checkout/email can
// never disagree. Unknown schedule (null pickupDays) → plain ready-by.
//
// PREORDER is exempt from the push: its ready_date is a deliberate per-dish
// cook decision (often a one-off event handoff — Thanksgiving pies on a
// Wednesday — outside the kitchen's weekly windows). The weekly heuristic
// must never override an explicit date the cook chose, and pushing it could
// also drift the promise past the validated preorder horizon.
export function computeGetIt(
  a: Availability,
  todayIso: string,
  pickupDays?: Set<number> | null
): string | null {
  const rb = computeReadyBy(a, todayIso);
  if (!rb) return null;
  if (!pickupDays || a.mode === "preorder") return rb;
  return nextHandoffIso(rb, pickupDays) ?? rb;
}

// ---- Display helpers ----

// "Sat, Aug 9" for a date-only string (formatted in UTC since the string has no
// time — avoids a local-tz shift).
export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

// "Saturday, August 9" — the fuller form for the checkout commitment line.
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export type AvailabilityBadge = {
  tone: "now" | "soon" | "date" | "closed";
  text: string;
};

// The buyer-facing timing chip. Answers the buyer's ONE question — "when will
// this be in my hands?" — not the chef-internal "when can it be made". With a
// parsed handoff schedule the date is pushed to the kitchen's next pickup day
// ("Get it Sat, Aug 15"); without one it degrades to the plain ready-by date.
// `tone` maps to color in the UI.
export function availabilityBadge(
  a: Availability,
  todayIso: string,
  pickupDays?: Set<number> | null
): AvailabilityBadge {
  if (a.mode === "preorder") {
    if (!isOrderable(a, todayIso))
      return { tone: "closed", text: "Ordering closed" };
    const readyDate = a.readyDate as string;
    const orderBy = isIsoDate(a.orderBy) ? (a.orderBy as string) : readyDate;
    const get = computeGetIt(a, todayIso, pickupDays) ?? readyDate;
    return {
      tone: "date",
      text: `Get it ${formatDateShort(get)} · order by ${formatDateShort(orderBy)}`,
    };
  }
  // ready_now / lead_time
  const get = computeGetIt(a, todayIso, pickupDays);
  if (!get) return { tone: "closed", text: "Ordering closed" };
  if (get === todayIso) return { tone: "now", text: "Get it today" };
  return { tone: "soon", text: `Get it ${formatDateShort(get)}` };
}
