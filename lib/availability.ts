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
      return addDaysIso(todayIso, clampLead(a.leadDays));
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
    if (orderBy > readyDate) return "The order-by cutoff can't be after the ready date.";
    return null;
  }
  return null; // ready_now: always valid
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

// The buyer-facing timing chip. `tone` maps to color in the UI.
export function availabilityBadge(
  a: Availability,
  todayIso: string
): AvailabilityBadge {
  if (a.mode === "ready_now") return { tone: "now", text: "Ready today" };
  if (a.mode === "lead_time") {
    return { tone: "soon", text: `Ready by ${formatDateShort(computeReadyBy(a, todayIso)!)}` };
  }
  // preorder
  if (!isOrderable(a, todayIso)) return { tone: "closed", text: "Ordering closed" };
  const readyDate = a.readyDate as string;
  const orderBy = isIsoDate(a.orderBy) ? (a.orderBy as string) : readyDate;
  return {
    tone: "date",
    text: `For ${formatDateShort(readyDate)} · order by ${formatDateShort(orderBy)}`,
  };
}
