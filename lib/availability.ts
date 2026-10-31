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

// ---- One-off (holiday) pickup days ----
//
// A pickup line that names a calendar date — "Thanksgiving pickup: Wed, Nov
// 25, 2026 · 2PM-5PM" — is a single handoff day, not part of the weekly
// schedule. The weekly parser skips such lines (so a holiday Wednesday never
// turns into "every Wednesday"), checkout offers exactly that date, and the
// line hides itself once the date has passed. Lines stay plain text in
// cooks.pickup_windows, so cooks can also type one by hand.
const MONTH_SRC =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATED_WINDOW_RE = new RegExp(
  `\\b${MONTH_SRC}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`,
  "i"
);
const MONTH_NUM: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Does this pickup line name a specific calendar date?
export function isDatedPickupWindow(line: string | null | undefined): boolean {
  return DATED_WINDOW_RE.test(String(line ?? ""));
}

// The "YYYY-MM-DD" a dated pickup line refers to, or null for a weekly line.
// No year written → this year, unless that's more than ~2 months gone, in
// which case next year (a "Jan 2" typed in December means the coming one).
export function datedPickupWindowDate(
  line: string | null | undefined,
  todayIso: string
): string | null {
  const m = String(line ?? "").match(DATED_WINDOW_RE);
  if (!m) return null;
  const month = MONTH_NUM[m[1].slice(0, 3).toLowerCase()];
  const day = Number(m[2]);
  const pad = (n: number) => String(n).padStart(2, "0");
  let year = m[3] ? Number(m[3]) : Number(todayIso.slice(0, 4));
  let iso = `${year}-${pad(month)}-${pad(day)}`;
  if (!m[3] && iso < addDaysIso(todayIso, -60)) {
    year += 1;
    iso = `${year}-${pad(month)}-${pad(day)}`;
  }
  return isIsoDate(iso) ? iso : null;
}

// ---- How cooks lay out the pickup-times box ----
//
// Free text, one line each. Two layouts are common and both work:
//   "Saturdays 2PM-5PM"                   one line per window, or
//   "Saturdays", then "2 PM", "2:30 PM"…  a day on its own line with the
//                                         slot times listed under it.
// A line that says WHEN (weekdays, or a holiday date) but gives no time opens
// a block; the time-only lines under it are that block's slots, and buyers
// choose one as "Saturdays 2:30 PM". Before this, each time-only line stood
// alone with no day: the weekly schedule went unreadable (so "Get it" could
// promise a weekday the kitchen doesn't hand off on) and checkout offered
// "2 PM" on any date at all. That was 40 Acres' real layout, Oct 2026.
const HAS_DAY_RE = new RegExp(
  `\\b${DAY_SRC}\\b|\\b(weekends?|weekdays?|daily|every ?day|all week|any ?day)\\b`,
  "i"
);
const TIMEISH_RE = /\d|\b(noon|midnight)\b/i;

export type PickupBlock = {
  line: string; // as the cook typed it (trimmed)
  slots: string[]; // time-only lines listed under it
  dated: boolean; // a one-off holiday day rather than the weekly schedule
};

export function pickupBlocks(lines: string[] | null | undefined): PickupBlock[] {
  const blocks: PickupBlock[] = [];
  let open: PickupBlock | null = null;
  for (const raw of lines ?? []) {
    const line = String(raw ?? "").trim();
    if (!line) continue;
    const dated = isDatedPickupWindow(line);
    const hasDay = HAS_DAY_RE.test(line);
    if (open && !dated && !hasDay && TIMEISH_RE.test(line)) {
      open.slots.push(line);
      continue;
    }
    const block: PickupBlock = { line, slots: [], dated };
    blocks.push(block);
    // Says when but not what time (a date's own digits don't count as a time).
    const rest = dated ? line.replace(DATED_WINDOW_RE, " ") : line;
    open = (hasDay || dated) && !TIMEISH_RE.test(rest) ? block : null;
  }
  return blocks;
}

// "Saturdays" + "2:30 PM" → "Saturdays 2:30 PM"; a holiday day takes a dot,
// like the one-line format: "Thanksgiving pickup: Wed, Nov 25, 2026 · 2:30 PM".
// Capped at checkout's 120-character pickup_time limit, so the value a buyer
// posts always matches what the server rebuilds.
function slotChoice(b: PickupBlock, slot: string): string {
  const head = b.line.replace(/[\s·|,;.-]+$/, "");
  return `${head}${b.dated ? " · " : " "}${slot}`.slice(0, 120);
}

// Every choice a buyer can make: a block's slots expand to "Saturdays 2 PM",
// "Saturdays 2:30 PM", …; other lines are offered as written. Idempotent, so
// an already-expanded list passes through unchanged.
export function expandPickupWindows(lines: string[] | null | undefined): string[] {
  return pickupBlocks(lines).flatMap((b) =>
    b.slots.length ? b.slots.map((s) => slotChoice(b, s)) : [b.line]
  );
}

// The cook's lines with any passed holiday day removed, together with the
// slot times listed under it. Keeps the cook's own layout, so Settings shows
// this for editing and the next save tidies the passed days away.
export function activePickupWindows(
  windows: string[] | null | undefined,
  todayIso: string
): string[] {
  return pickupBlocks(windows)
    .filter((b) => {
      const d = datedPickupWindowDate(b.line, todayIso);
      return d === null || d >= todayIso;
    })
    .flatMap((b) => [b.line, ...b.slots]);
}

// The pickup choices checkout offers (client and server alike): one per slot,
// passed holiday days gone.
export function pickupChoices(
  windows: string[] | null | undefined,
  todayIso: string
): string[] {
  return expandPickupWindows(activePickupWindows(windows, todayIso));
}

// The checkout dropdown's text for a pickup choice. A closed dropdown on a
// phone shows only ~35 characters, which cut a holiday slot ("Thanksgiving
// pickup: Wed, Nov 25, 2026 · 2:30 PM") off right before its time — so a
// holiday choice leads with what the buyer is picking: "Wed, Nov 25 ·
// 2:30 PM · Thanksgiving". The option's VALUE stays the full line, which is
// what the server checks and what the order records.
const CANONICAL_DATED_RE =
  /^(.+?): [A-Za-z]{3}, [A-Za-z]{3} \d{1,2}, \d{4}(?: · (.+))?$/;
export function pickupChoiceLabel(choice: string, todayIso: string): string {
  const date = datedPickupWindowDate(choice, todayIso);
  const m = choice.match(CANONICAL_DATED_RE);
  if (!date || !m) return choice;
  const name = m[1].replace(/\s+pickup$/i, "") || m[1];
  return [formatDateShort(date), m[2], name].filter(Boolean).join(" · ");
}

// Minutes after midnight for a plain slot time ("2 PM", "3:30PM", "noon"), or
// null for anything else.
function slotMinutes(t: string): number | null {
  const s = t.toLowerCase().replace(/\./g, "").trim();
  if (s === "noon") return 720;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h < 1 || h > 12 || min > 59) return null;
  return (h % 12) * 60 + min + (m[3] === "pm" ? 720 : 0);
}

// A block's slot times as one phrase: a run of 4+ in time order reads as its
// span ("2 PM to 5:30 PM"); anything else is listed ("11 AM, 4 PM").
export function pickupSlotsLabel(slots: string[]): string {
  if (slots.length >= 4) {
    const mins = slots.map(slotMinutes);
    const inOrder = mins.every(
      (m, i) => m !== null && (i === 0 || m > (mins[i - 1] as number))
    );
    if (inOrder) return `${slots[0]} to ${slots[slots.length - 1]}`;
  }
  return slots.join(", ");
}

// The schedule as display lines, each block's slots kept together:
// "Saturdays 2 PM to 5:30 PM", "Sundays".
export function pickupScheduleSummary(lines: string[] | null | undefined): string[] {
  return pickupBlocks(lines).map((b) =>
    b.slots.length ? slotChoice(b, pickupSlotsLabel(b.slots)) : b.line
  );
}

export function parsePickupDays(
  windows: string[] | null | undefined
): Set<number> | null {
  if (!windows || windows.length === 0) return null;
  const days = new Set<number>();
  for (const w of expandPickupWindows(windows)) {
    // One-off dated lines aren't part of the weekly schedule.
    if (isDatedPickupWindow(w)) continue;
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

// Short human label for a LIMITED handoff schedule — "Saturdays", "Sat & Sun",
// "Fri, Sat & Sun". Returns null for an unknown schedule (parse failed) OR a
// full 7-day/daily one, so a non-null result means exactly "this kitchen only
// hands off on some days". Used to warn a cook that a zero-notice ("ready now")
// dish over-promises same-day pickup on those days.
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function pickupDaysLabel(
  days: Set<number> | null | undefined
): string | null {
  if (!days || days.size === 0 || days.size >= 7) return null;
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_ABBR[d]);
  if (names.length === 1) return `${names[0]}s`;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

// Buyer-facing version of the same schedule, in full words for an error
// message — "Saturdays", "Saturdays and Sundays", "Fridays, Saturdays and
// Sundays". Null for an unknown or 7-day schedule, like pickupDaysLabel.
const DAY_FULL = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];
export function pickupDaysSentence(
  days: Set<number> | null | undefined
): string | null {
  if (!days || days.size === 0 || days.size >= 7) return null;
  // Monday-first, so a weekend reads "Saturdays and Sundays", not the other
  // way round (0 = Sunday in the day-of-week model).
  const monFirst = (d: number) => (d + 6) % 7;
  const names = [...days]
    .sort((a, b) => monFirst(a) - monFirst(b))
    .map((d) => DAY_FULL[d]);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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

// Can a buyer act on this listing right now — not sold out, and orderable on
// timing (a preorder past its cutoff is not)? The kitchen page's one rule for
// "open menu vs. currently unavailable"; the dashboard reuses it so anything
// it promises about the storefront (e.g. the #trays catering link) matches
// what the storefront actually renders.
export function isListingOpen(
  l: {
    limited_quantity?: boolean | null;
    quantity_available?: number | null;
    fulfillment_mode?: string | null;
    lead_days?: number | null;
    ready_date?: string | null;
    order_by?: string | null;
  },
  todayIso: string
): boolean {
  if (l.limited_quantity && (l.quantity_available ?? 0) <= 0) return false;
  return isOrderable(availabilityFromListing(l), todayIso);
}

// Every date from `fromIso` through `fromIso + horizonDays` (inclusive) that
// lands on one of `days` — the choices a checkout "Pickup date" picker offers
// when the kitchen's weekly schedule parsed. Unknown/empty schedule → [] and
// callers fall back to a free date input.
export function pickupDatesFrom(
  fromIso: string,
  days: Set<number> | null | undefined,
  horizonDays: number
): string[] {
  if (!days || days.size === 0) return [];
  const out: string[] = [];
  let cur = fromIso;
  for (let i = 0; i <= horizonDays; i++) {
    if (days.has(isoDayOfWeek(cur))) out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
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
