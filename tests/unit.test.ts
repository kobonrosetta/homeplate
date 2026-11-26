import assert from "node:assert";
import { slugify } from "../lib/slug";
import { titleCase, publicArea } from "../lib/handoff";
import sharp from "sharp";
import { optimizeImageBuffer } from "../lib/image";
import {
  calcServiceFeeCents,
  calcTotalCents,
  formatUsd,
  formatPhone,
} from "../lib/constants";
import {
  normalizePermit,
  namesMatch,
  nameMatchTier,
  isExpired,
} from "../lib/match";
import { deriveUnitPrice, cartLineKey } from "../lib/options";
import { accountStatus, createRefund } from "../lib/stripe";
import {
  SANTA_CLARA_COUNTY_RATE,
  taxRateForCity,
  taxPortionCents,
  netOfTaxCents,
  formatRate,
  quarterOf,
  previousQuarter,
} from "../lib/tax";
import {
  addDaysIso,
  isIsoDate,
  computeReadyBy,
  isOrderable,
  validateAvailability,
  availabilityBadge,
  pacificTodayIso,
  parsePickupDays,
  pickupDaysLabel,
  nextHandoffIso,
  computeGetIt,
  pickupDatesFrom,
  isoDayOfWeek,
  pickupDaysSentence,
  isListingOpen,
  isDatedPickupWindow,
  datedPickupWindowDate,
  activePickupWindows,
  expandPickupWindows,
  pickupChoiceLabel,
  pickupChoices,
  pickupScheduleSummary,
  pickupSlotsLabel,
} from "../lib/availability";
import {
  REFUND_CLAIM_STALE_MINUTES,
  REFUND_RETRY_HOURS,
  refundState,
  refundDueAt,
  isRefundDue,
  canUndoCancel,
  canRefundNow,
  isMissingHoldColumn,
  formatHoldTime,
} from "../lib/refund-hold";
import { REFUND_HOLD_HOURS } from "../lib/constants";
import {
  holidaysForYear,
  upcomingHolidays,
  holidayNudge,
  weeklyPickupHours,
  holidayPickupLine,
  holidayPickupLines,
} from "../lib/holidays";
import {
  MENU_SECTIONS,
  menuSectionFor,
  splitFeedsFromTitle,
  cookTagline,
  sectionedMenuIds,
  stripSectionPrefix,
  sizeLabelFor,
  groupSizeVariants,
  feedsRange,
} from "../lib/menu-display";

let pass = 0;
let fail = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("  ✓ " + name);
    pass++;
  } catch (e) {
    console.log("  ✗ " + name + " — " + (e as Error).message);
    fail++;
  }
}

// Async variant for checks that genuinely need await (image processing). The
// summary at the bottom waits for these before printing.
const pending: Promise<void>[] = [];
function checkAsync(name: string, fn: () => Promise<void>) {
  pending.push(
    fn()
      .then(() => {
        console.log("  ✓ " + name);
        pass++;
      })
      .catch((e) => {
        console.log("  ✗ " + name + " — " + (e as Error).message);
        fail++;
      })
  );
}

// --- slug logic ---
check("formatPhone: raw 10 digits → (669) 213-2181", () =>
  assert.equal(formatPhone("6692132181"), "(669) 213-2181"));
check("formatPhone: leading 1 + punctuation tolerated", () => {
  assert.equal(formatPhone("1-669-213-2181"), "(669) 213-2181");
  assert.equal(formatPhone("(669) 213 2181"), "(669) 213-2181");
});
check("formatPhone: non-US / junk passes through as typed", () => {
  assert.equal(formatPhone("+44 20 7946 0958"), "+44 20 7946 0958");
  assert.equal(formatPhone("ask for Q"), "ask for Q");
  assert.equal(formatPhone(null), "");
});
check("slugify: basic", () => assert.equal(slugify("Kate's Bread"), "kates-bread"));
check("slugify: collapses spaces/punctuation", () =>
  assert.equal(slugify("  The   Daily  Loaf!! "), "the-daily-loaf"));
check("titleCase: lowercase → Capitalized", () =>
  assert.equal(titleCase("campbell"), "Campbell"));
check("titleCase: ALL CAPS + multi-word", () =>
  assert.equal(titleCase("SAN JOSE"), "San Jose"));
check("titleCase: trims + collapses inner whitespace", () =>
  assert.equal(titleCase("  mountain   view "), "Mountain View"));
check("titleCase: empty / null → ''", () => {
  assert.equal(titleCase(""), "");
  assert.equal(titleCase(null), "");
});
check("titleCase: deliberate mixed case passes through untouched", () => {
  assert.equal(titleCase("McKinley"), "McKinley"); // real SJ neighborhood
  assert.equal(titleCase("SoFA"), "SoFA"); // South First Area, San Jose
  assert.equal(titleCase("O'Brien Court"), "O'Brien Court");
});
check("titleCase: hyphen/slash compounds normalize per segment", () => {
  assert.equal(titleCase("cambrian-pioneer"), "Cambrian-Pioneer");
  assert.equal(titleCase("burbank/del monte"), "Burbank/Del Monte");
});
check("titleCase: idempotent (write-then-display applies it twice)", () => {
  assert.equal(titleCase(titleCase("SAN JOSE")), "San Jose");
  assert.equal(titleCase(titleCase("SoFA")), "SoFA");
});
check("publicArea: title-cases city, blank neighborhood dropped", () =>
  assert.equal(publicArea(null, "campbell"), "Campbell"));
check("publicArea: joins + normalizes both", () =>
  assert.equal(publicArea("willow glen", "SAN JOSE"), "Willow Glen, San Jose"));
check("slugify: empty falls back to 'kitchen'", () =>
  assert.equal(slugify("!!!"), "kitchen"));

// --- money logic (the important one) ---
check("fee on $12 order = $1.26 (8% + $0.30)", () =>
  assert.equal(calcServiceFeeCents(1200), 126));
check("fee on $40 order = $3.50", () =>
  assert.equal(calcServiceFeeCents(4000), 350));
check("fee on $0 = $0", () => assert.equal(calcServiceFeeCents(0), 0));
check("total = subtotal + fee", () =>
  assert.equal(calcTotalCents(1200), 1326));
check("cook keeps 100%: total minus fee equals their price", () =>
  assert.equal(calcTotalCents(1200) - calcServiceFeeCents(1200), 1200));
check("formatUsd renders cents correctly", () =>
  assert.equal(formatUsd(1326), "$13.26"));

// --- county permit matching (the trust gate) ---
check("normalizePermit uppercases + strips spaces", () =>
  assert.equal(normalizePermit(" pt050 3912 "), "PT0503912"));
check("namesMatch: case + spacing insensitive", () =>
  assert.ok(namesMatch("Raffin Bakery", "  raffin   bakery ")));
check("namesMatch: apostrophes + case folded", () =>
  assert.ok(namesMatch("Abuela's Cocina", "ABUELAS COCINA")));
check("namesMatch: genuinely different names do NOT match", () =>
  assert.ok(!namesMatch("Totally Fake Kitchen", "Raffin Bakery")));
check("namesMatch: possessive differs from base — conservative miss (→ human review)", () =>
  assert.ok(!namesMatch("Raffins Bakery", "Raffin Bakery")));
check("namesMatch: empty never matches", () =>
  assert.ok(!namesMatch("", "")));
check("isExpired: past date is expired", () =>
  assert.ok(isExpired("2026-01-01", "2026-07-24")));
check("isExpired: future date is current", () =>
  assert.ok(!isExpired("2027-01-01", "2026-07-24")));
check("isExpired: missing expiry treated as current", () =>
  assert.ok(!isExpired(null, "2026-07-24")));

// --- advisory name tiers (never gate; just guide the reviewer) ---
check("nameMatchTier: identical → exact", () =>
  assert.equal(nameMatchTier("Raffin Bakery", "RAFFIN BAKERY"), "exact"));
check("nameMatchTier: DBA sharing a distinctive word → partial", () =>
  assert.equal(nameMatchTier("Gonzalez Empanadas", "MARIA GONZALEZ"), "partial"));
check("nameMatchTier: only a generic word in common → none", () =>
  assert.equal(nameMatchTier("Sunrise Kitchen", "Mountain View Kitchen"), "none"));
check("nameMatchTier: totally different → none", () =>
  assert.equal(nameMatchTier("Joe's Tacos", "Raffin Bakery"), "none"));
check("nameMatchTier: generic-only names still compare (The Cake Co vs Cake Co) → partial", () =>
  assert.equal(nameMatchTier("The Cake Co", "Cake Co"), "partial"));
check("nameMatchTier: generic-only vs unrelated generic → none", () =>
  assert.equal(nameMatchTier("The Cake Co", "Home Eats"), "none"));

// --- item-option pricing (server-side derivation — the money path) ---
const G = [{ id: "g1", listing_id: "L1" }, { id: "g2", listing_id: "L1" }];
const O = [
  { id: "o6", group_id: "g1", name: '6"', price_delta_cents: 0 },
  { id: "o7", group_id: "g1", name: '7"', price_delta_cents: 1300 },
  { id: "bear", group_id: "g2", name: "Bear", price_delta_cents: 1000 },
  { id: "none", group_id: "g2", name: "None", price_delta_cents: 0 },
  { id: "other", group_id: "gX", name: "Alien", price_delta_cents: 500 },
];
check("options: base + deltas derive correctly", () => {
  const r = deriveUnitPrice(6000, "L1", G, O, ["o7", "bear"]);
  assert.deepEqual(r, { unitPriceCents: 8300, optionNames: ['7"', "Bear"] });
});
check("options: zero-delta choices keep base price", () => {
  const r = deriveUnitPrice(6000, "L1", G, O, ["o6", "none"]);
  assert.equal((r as any).unitPriceCents, 6000);
});
check("options: missing a group's choice → error", () =>
  assert.ok("error" in deriveUnitPrice(6000, "L1", G, O, ["o7"])));
check("options: two choices from one group → error", () =>
  assert.ok("error" in deriveUnitPrice(6000, "L1", G, O, ["o6", "o7", "none"])));
check("options: option from ANOTHER listing's group → error", () =>
  assert.ok("error" in deriveUnitPrice(6000, "L1", G, O, ["o7", "other"])));
check("options: unknown option id → error", () =>
  assert.ok("error" in deriveUnitPrice(6000, "L1", G, O, ["o7", "nope"])));
check("options: listing with no groups accepts no options", () => {
  assert.equal(
    (deriveUnitPrice(500, "L2", G, O, []) as any).unitPriceCents,
    500
  );
  assert.ok("error" in deriveUnitPrice(500, "L2", G, O, ["o6"]));
});
check("cartLineKey: same options in any order = same line", () =>
  assert.equal(cartLineKey("L1", ["b", "a"]), cartLineKey("L1", ["a", "b"])));
check("cartLineKey: different options = different lines", () =>
  assert.notEqual(cartLineKey("L1", ["a"]), cartLineKey("L1", ["b"])));
check("cartLineKey: no options = plain listing id", () =>
  assert.equal(cartLineKey("L1"), "L1"));

// --- CA sales tax (pilot: prices are tax-included; cook remits) ---
check("tax: most cities fall on the county rate", () =>
  assert.equal(taxRateForCity("Sunnyvale"), SANTA_CLARA_COUNTY_RATE));
check("tax: San José city rate (accent + case + spacing folded)", () =>
  assert.equal(taxRateForCity("  San  JOSÉ "), 0.1));
check("tax: Campbell district rate", () =>
  assert.equal(taxRateForCity("Campbell"), 0.105));
check("tax: unknown or missing city -> county rate", () => {
  assert.equal(taxRateForCity("Narnia"), SANTA_CLARA_COUNTY_RATE);
  assert.equal(taxRateForCity(null), SANTA_CLARA_COUNTY_RATE);
  assert.equal(taxRateForCity(""), SANTA_CLARA_COUNTY_RATE);
});
check("tax: $20.00 tax-included at 9.75% contains $1.78 (not $1.95)", () =>
  assert.equal(taxPortionCents(2000, 0.0975), 178));
check("tax: net + tax portion always equals the listed price", () =>
  assert.equal(
    netOfTaxCents(2000, 0.0975) + taxPortionCents(2000, 0.0975),
    2000
  ));
check("tax: zero and negative prices contain no tax", () => {
  assert.equal(taxPortionCents(0, 0.0975), 0);
  assert.equal(taxPortionCents(-500, 0.0975), 0);
});
check("tax: formatRate trims trailing zeros", () => {
  assert.equal(formatRate(0.0975), "9.75%");
  assert.equal(formatRate(0.1), "10%");
  assert.equal(formatRate(0.09875), "9.875%");
  assert.equal(formatRate(0.105), "10.5%");
});
check("tax: Q3 return is due Oct 31", () => {
  const q = quarterOf(new Date(2026, 7, 15)); // Aug 15
  assert.equal(q.label, "Q3 2026");
  assert.equal(q.dueDate.getMonth(), 9);
  assert.equal(q.dueDate.getDate(), 31);
});
check("tax: Q4 return is due Jan 31 of the NEXT year", () => {
  const q = quarterOf(new Date(2026, 11, 2)); // Dec 2
  assert.equal(q.dueDate.getFullYear(), 2027);
  assert.equal(q.dueDate.getMonth(), 0);
  assert.equal(q.dueDate.getDate(), 31);
});
check("tax: previousQuarter crosses the year boundary", () => {
  const q = previousQuarter(new Date(2026, 0, 10)); // Jan 10
  assert.equal(q.label, "Q4 2025");
});
check("tax: quarter ranges are exclusive at the boundary", () => {
  const q = quarterOf(new Date(2026, 6, 1)); // Jul 1
  assert.ok(q.start.getTime() === new Date(2026, 6, 1).getTime());
  assert.ok(q.end.getTime() === new Date(2026, 9, 1).getTime());
});

// ---- Stripe Connect: accountStatus readiness mapping ----
// Readiness must key on the TRANSFERS capability — a transfers-only Express
// account keeps charges_enabled=false forever, so charges_enabled must never
// influence the result (that exact bug would block every order).
check("connect: fully onboarded account maps to all-true", () => {
  const s = accountStatus({
    capabilities: { transfers: "active" },
    payouts_enabled: true,
    details_submitted: true,
    charges_enabled: false, // normal for transfers-only; must not matter
    requirements: { disabled_reason: null },
  });
  assert.deepEqual(s, {
    transfersActive: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    disabledReason: null,
  });
});
check("connect: pending/inactive transfers capability is not active", () => {
  for (const cap of ["pending", "inactive", undefined]) {
    const s = accountStatus({
      capabilities: { transfers: cap },
      payouts_enabled: true,
      details_submitted: true,
    });
    assert.equal(s.transfersActive, false);
  }
});
check("connect: missing/garbage account object fails closed", () => {
  for (const acct of [{}, null, undefined, { capabilities: null }]) {
    const s = accountStatus(acct);
    assert.equal(s.transfersActive, false);
    assert.equal(s.payoutsEnabled, false);
    assert.equal(s.detailsSubmitted, false);
    assert.equal(s.disabledReason, null);
  }
});
check("connect: disabled_reason is surfaced", () => {
  const s = accountStatus({
    capabilities: { transfers: "inactive" },
    payouts_enabled: false,
    details_submitted: true,
    requirements: { disabled_reason: "requirements.past_due" },
  });
  assert.equal(s.disabledReason, "requirements.past_due");
});

// --- availability / timing model (the new guardrail) ---
const TODAY = "2026-08-07"; // fixed "today" for deterministic tests

// date arithmetic
check("addDaysIso: simple add", () => assert.equal(addDaysIso("2026-08-07", 2), "2026-08-09"));
check("addDaysIso: month rollover", () => assert.equal(addDaysIso("2026-08-31", 1), "2026-09-01"));
check("addDaysIso: year rollover", () => assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01"));
check("addDaysIso: leap day", () => assert.equal(addDaysIso("2028-02-28", 1), "2028-02-29"));
check("addDaysIso: zero is identity", () => assert.equal(addDaysIso("2026-08-07", 0), "2026-08-07"));
check("isIsoDate: valid", () => assert.ok(isIsoDate("2026-08-07")));
check("isIsoDate: rejects garbage", () => assert.ok(!isIsoDate("2026-13-40")));
check("isIsoDate: rejects non-string", () => assert.ok(!isIsoDate(null as any)));
check("pacificTodayIso: shape is YYYY-MM-DD", () =>
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(pacificTodayIso(new Date("2026-08-07T12:00:00Z")))));
check("pacificTodayIso: late-night UTC still Pacific-dated", () =>
  // 2026-08-08 05:00 UTC = 2026-08-07 22:00 Pacific → still the 7th
  assert.equal(pacificTodayIso(new Date("2026-08-08T05:00:00Z")), "2026-08-07"));

// computeReadyBy per mode
check("ready_now → today", () =>
  assert.equal(computeReadyBy({ mode: "ready_now" }, TODAY), TODAY));
check("lead_time → today + N", () =>
  assert.equal(computeReadyBy({ mode: "lead_time", leadDays: 3 }, TODAY), "2026-08-10"));
check("lead_time: promising the past is impossible (added to today)", () =>
  assert.ok(computeReadyBy({ mode: "lead_time", leadDays: 2 }, TODAY)! > TODAY));
check("preorder (open) → the ready date", () =>
  assert.equal(
    computeReadyBy({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-18" }, TODAY),
    "2026-08-20"
  ));
check("preorder past cutoff → null (no date)", () =>
  assert.equal(
    computeReadyBy({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-05" }, TODAY),
    null
  ));
// computeReadyBy and isOrderable must agree for a malformed lead_time
check("lead_time over cap → null (agrees with isOrderable)", () =>
  assert.equal(computeReadyBy({ mode: "lead_time", leadDays: 15 }, TODAY), null));
check("lead_time null leadDays → null (agrees with isOrderable)", () =>
  assert.equal(computeReadyBy({ mode: "lead_time", leadDays: null }, TODAY), null));

// isOrderable — the checkout guard
check("orderable: ready_now always", () => assert.ok(isOrderable({ mode: "ready_now" }, TODAY)));
check("orderable: lead_time within cap", () =>
  assert.ok(isOrderable({ mode: "lead_time", leadDays: 14 }, TODAY)));
check("NOT orderable: lead_time over cap", () =>
  assert.ok(!isOrderable({ mode: "lead_time", leadDays: 15 }, TODAY)));
check("orderable: preorder before cutoff", () =>
  assert.ok(isOrderable({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-18" }, TODAY)));
check("NOT orderable: preorder after cutoff", () =>
  assert.ok(!isOrderable({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-05" }, TODAY)));
check("NOT orderable: preorder ready date in the past", () =>
  assert.ok(!isOrderable({ mode: "preorder", readyDate: "2026-08-01", orderBy: "2026-08-01" }, TODAY)));
check("NOT orderable: preorder beyond 30-day horizon", () =>
  assert.ok(!isOrderable({ mode: "preorder", readyDate: "2026-10-01", orderBy: "2026-09-30" }, TODAY)));
check("orderable: preorder cutoff defaults to ready date when omitted", () =>
  assert.ok(isOrderable({ mode: "preorder", readyDate: "2026-08-20" }, TODAY)));

// validateAvailability — server-side save gate
check("validate: ready_now ok", () => assert.equal(validateAvailability({ mode: "ready_now" }, TODAY), null));
check("validate: lead_time ok", () =>
  assert.equal(validateAvailability({ mode: "lead_time", leadDays: 2 }, TODAY), null));
check("validate: lead_time over cap → error", () =>
  assert.ok(validateAvailability({ mode: "lead_time", leadDays: 20 }, TODAY)));
check("validate: preorder needs a date", () =>
  assert.ok(validateAvailability({ mode: "preorder", readyDate: null }, TODAY)));
check("validate: preorder date in past → error", () =>
  assert.ok(validateAvailability({ mode: "preorder", readyDate: "2026-08-01" }, TODAY)));
check("validate: preorder beyond horizon → error", () =>
  assert.ok(validateAvailability({ mode: "preorder", readyDate: "2026-10-01" }, TODAY)));
check("validate: order-by after ready date → error", () =>
  assert.ok(validateAvailability({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-25" }, TODAY)));
check("validate: order-by in the past → error", () =>
  assert.ok(validateAvailability({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-05" }, TODAY)));
check("validate: valid preorder ok", () =>
  assert.equal(validateAvailability({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-18" }, TODAY), null));

// badges
check("badge: ready_now → Get it today / now", () => {
  const b = availabilityBadge({ mode: "ready_now" }, TODAY);
  assert.equal(b.tone, "now");
  assert.equal(b.text, "Get it today");
});
check("badge: lead_time → soon + a date", () => {
  const b = availabilityBadge({ mode: "lead_time", leadDays: 2 }, TODAY);
  assert.equal(b.tone, "soon");
  assert.ok(b.text.startsWith("Get it "));
});

// ---- handoff-aware "Get it" model (pickup-day parsing) ----
// TODAY (2026-08-07) is a FRIDAY.

check("parsePickupDays: Chef Q's real windows → Sat+Sun", () => {
  const d = parsePickupDays(["Saturdays 11AM-10 PM", "Sundays 2PM to 7 PM"]);
  assert.deepEqual([...d!].sort(), [0, 6]);
});
check("parsePickupDays: abbreviations + weekend keyword", () => {
  assert.deepEqual([...parsePickupDays(["Sat & Sun evenings"])!].sort(), [0, 6]);
  assert.deepEqual([...parsePickupDays(["weekends only"])!].sort(), [0, 6]);
  assert.deepEqual([...parsePickupDays(["Fri 5-8pm"])!], [5]);
});
check("parsePickupDays: one unreadable window → null (schedule unknown)", () => {
  assert.equal(parsePickupDays(["Saturdays 11-10", "after church"]), null);
  assert.equal(parsePickupDays(["whenever works"]), null);
  assert.equal(parsePickupDays([]), null);
  assert.equal(parsePickupDays(null), null);
});
check("parsePickupDays: day words don't fire inside other words", () => {
  assert.equal(parsePickupDays(["saturated market hours"]), null);
  assert.equal(parsePickupDays(["sunset pickups"]), null);
});

// ---- pre-booked pickup dates (checkout "Pickup date" picker) ----
// 2026-10-18 is a SUNDAY.

check("pickupDatesFrom: Chef Q's live windows → only Sat/Sun dates, inclusive horizon", () => {
  const days = parsePickupDays(["Saturdays 2PM-5PM", "Sundays.  2PM to 5 PM"]);
  assert.deepEqual([...days!].sort(), [0, 6]);
  assert.deepEqual(pickupDatesFrom("2026-10-18", days, 14), [
    "2026-10-18",
    "2026-10-24",
    "2026-10-25",
    "2026-10-31",
    "2026-11-01",
  ]);
});
check("pickupDatesFrom: unknown or empty schedule → no choices (free date input)", () => {
  assert.deepEqual(pickupDatesFrom("2026-10-18", null, 30), []);
  assert.deepEqual(pickupDatesFrom("2026-10-18", new Set<number>(), 30), []);
});
check("pickupDatesFrom: horizon bound is inclusive of the last day", () => {
  assert.deepEqual(pickupDatesFrom("2026-10-18", new Set([0]), 7), ["2026-10-18", "2026-10-25"]);
  assert.deepEqual(pickupDatesFrom("2026-10-18", new Set([0]), 6), ["2026-10-18"]);
});
check("pickupDatesFrom: a Thursday never appears for a weekend-only kitchen (server rule mirror)", () => {
  const days = parsePickupDays(["Saturdays 2PM-5PM"]);
  for (const d of pickupDatesFrom("2026-10-18", days, 90)) assert.equal(isoDayOfWeek(d), 6);
});
check("pickupDaysSentence: buyer-facing full words, never 'Sats'", () => {
  assert.equal(pickupDaysSentence(new Set([6])), "Saturdays");
  assert.equal(pickupDaysSentence(new Set([0, 6])), "Saturdays and Sundays");
  assert.equal(pickupDaysSentence(new Set([5, 6, 0])), "Fridays, Saturdays and Sundays");
  assert.equal(pickupDaysSentence(null), null);
  assert.equal(pickupDaysSentence(new Set([0, 1, 2, 3, 4, 5, 6])), null);
});
check("menu sections: 40 Acres' real naming maps cleanly", () => {
  assert.equal(menuSectionFor("BUFFET-STYLE: SHRIMP, CHICKEN & SAUSAGE JAMBALAYA (FEEDS 18-20)"), "trays");
  assert.equal(menuSectionFor("BUFFET STYLE: BAKED MACARONI & CHEESE ( FEEDS 18-20)"), "trays");
  assert.equal(menuSectionFor("FAMILY-STYLE: THE \"CLASSIC\" SOUL FOOD DINNER (FEEDS 8-10)"), "family-dinners");
  assert.equal(menuSectionFor("JERK CHICKEN FAMILY DINNER"), "family-dinners");
  assert.equal(menuSectionFor("CANDIED YAMS"), "plates-sides");
  assert.equal(menuSectionFor("KETO OXTAIL BOWL"), "plates-sides");
  assert.equal(MENU_SECTIONS.length, 3);
});

// ---- kitchen menu navigation (Oct 2026: plates were on screen 15 of 24) ----
// Chef Q's live 38 dish titles (kind = dish), Oct 19 2026.
const Q_TRAYS = [
  "BUFFET STYLE: BAKED MACARONI & CHEESE ( FEEDS 18-20)",
  "BUFFET STYLE: BAKED MACARONI & CHEESE ( FEEDS 8-10)",
  "BUFFET STYLE: BAKED SALMON ( FEEDS 18-20)",
  "BUFFET STYLE: BAKED SALMON ( FEEDS 8-10)",
  "BUFFET STYLE: BBQ CHICKEN (FEEDS 18-20/40-45PCS)",
  "BUFFET STYLE: BBQ CHICKEN (FEEDS 8-10/ 20-25PCS)",
  "BUFFET STYLE: CHILLED SHRIMP SALAD (SMALL FEEDS 18-20)",
  "BUFFET STYLE: CHILLED SHRIMP SALAD (SMALL FEEDS 8-10)",
  "BUFFET STYLE: COLLARD GREENS + SMOKED TURKEY (FEEDS 18-20)",
  "BUFFET STYLE: COLLARD GREENS + SMOKED TURKEY (FEEDS 8-10)",
  "BUFFET-STYLE: ARROZ CON GANDULES / PUERTORICAN RICE N' PEAS (FEEDS 18-20)",
  "BUFFET-STYLE: ARROZ CON GANDULES / PUERTORICAN RICE N' PEAS (FEEDS 8-10)",
  "BUFFET-STYLE: CANDIED YAMS (FEEDS 18-20)",
  "BUFFET-STYLE: CANDIED YAMS (FEEDS 8-10)",
  "BUFFET-STYLE: HERB ROASTED CHICKEN (FEEDS 8-10)",
  "BUFFET-STYLE: PINCHOS / GRILLED CHICKEN KEBOBS -12 EA",
  "BUFFET-STYLE: PINCHOS / GRILLED CHICKEN KEBOBS -24 EA",
  "BUFFET-STYLE: PINCHOS / GRILLED CHICKEN KEBOBS -48 EA",
  "BUFFET-STYLE: ROASTED CHICKEN (FEEDS 18-20)",
  "BUFFET-STYLE: SHRIMP, CHICKEN & SAUSAGE JAMBALAYA (FEEDS 18-20)",
  "BUFFET-STYLE: SHRIMP, CHICKEN & SAUSAGE JAMBALAYA (FEEDS 8-10)",
];
const Q_FAMILY = [
  'FAMILY-STYLE: THE "CLASSIC" SOUL FOOD DINNER (FEEDS 4-6)',
  'FAMILY-STYLE: THE "CLASSIC" SOUL FOOD DINNER (FEEDS 8-10)',
];
const Q_PLATES = [
  "40 oz SIGNATURE SEAFOOD GUMBO NO CRAB (40 OZ / 1-2 Servings)",
  "40 oz SIGNATURE SEAFOOD GUMBO WITH CRAB (40 OZ / 1-2 Servings)",
  "ARROZ CON GANDULES (Puertorican Rice with Pigeon Peas)",
  "BAKED MACARONI & CHEESE",
  "CANDIED YAMS",
  "CHICKEN, SAUSAGE & SHRIMP JAMBALAYA BOWL",
  "CHICKEN, SHRIMP & SAUSAGE JAMBALAYA BOWL",
  "COLLARD GREENS",
  "PINCHOS DE POLLO + GARLIC BREAD ( 2 for $10)",
  "SAMOSA-DILLA (VEGGIE  EMPANADILLA)",
  "SEAFOOD SALAD",
  "SHRIMP CRIOLLA EMPANADILLAS",
  "SOUTHEN OXTAILS & GRAVY FEAST (FEEDS 1)",
  "SOUTHERN OXTAILS & GRAVY DINNER",
  'THE "CLASSIC" SOUL FOOD DINNER',
];
const t = (titles: string[]) => titles.map((title) => ({ title }));

check("menu order: plates first (16 of 18 checkouts), trays second, family dinners last", () => {
  assert.deepEqual(MENU_SECTIONS.map((s) => s.id), ["plates-sides", "trays", "family-dinners"]);
  for (const s of MENU_SECTIONS) assert.ok(s.tab.length <= 15, `tab label "${s.tab}" must fit a phone`);
});
check("sectionedMenuIds: her real menu sections in page order; a flat menu stays flat", () => {
  assert.deepEqual(sectionedMenuIds([...Q_TRAYS, ...Q_FAMILY, ...Q_PLATES]), [
    "plates-sides",
    "trays",
    "family-dinners",
  ]);
  // A bakery with no BUFFET/FAMILY titles → one flat grid, no tabs.
  assert.equal(sectionedMenuIds(["SOURDOUGH LOAF", "CONCHAS (6)", "PAN DE MUERTO"]), null);
  // One real section + a single stray tray is not a split.
  assert.equal(sectionedMenuIds(["A PLATE", "B PLATE", "BUFFET STYLE: X (FEEDS 8-10)"]), null);
});
check("stripSectionPrefix: display-only, both spellings, never empties a title", () => {
  assert.equal(stripSectionPrefix("BUFFET STYLE: BAKED SALMON"), "BAKED SALMON");
  assert.equal(stripSectionPrefix("BUFFET-STYLE: CANDIED YAMS"), "CANDIED YAMS");
  assert.equal(stripSectionPrefix('FAMILY-STYLE: THE "CLASSIC" SOUL FOOD DINNER'), 'THE "CLASSIC" SOUL FOOD DINNER');
  assert.equal(stripSectionPrefix("JERK CHICKEN FAMILY DINNER"), "JERK CHICKEN FAMILY DINNER");
  assert.equal(stripSectionPrefix("BUFFET STYLE:"), "BUFFET STYLE:");
});
check("sizeLabelFor: feeds parentheticals and piece counts", () => {
  assert.deepEqual(sizeLabelFor("BUFFET STYLE: BAKED SALMON ( FEEDS 8-10)"), { base: "BUFFET STYLE: BAKED SALMON", size: "Feeds 8–10" });
  assert.deepEqual(sizeLabelFor("BUFFET STYLE: BBQ CHICKEN (FEEDS 18-20/40-45PCS)"), { base: "BUFFET STYLE: BBQ CHICKEN", size: "Feeds 18–20" });
  assert.deepEqual(sizeLabelFor("BUFFET-STYLE: PINCHOS / GRILLED CHICKEN KEBOBS -48 EA"), { base: "BUFFET-STYLE: PINCHOS / GRILLED CHICKEN KEBOBS", size: "48 pcs" });
  assert.deepEqual(sizeLabelFor("SEAFOOD SALAD"), { base: "SEAFOOD SALAD", size: null });
});
check("groupSizeVariants: her 21 tray cards fold to 11, family dinners to 1", () => {
  const trays = groupSizeVariants(t(Q_TRAYS));
  assert.equal(trays.length, 11);
  const sizesOf = (needle: string) =>
    trays.find((g) => g.title.includes(needle))!.members.map((m) => m.size);
  assert.deepEqual(sizesOf("BAKED MACARONI"), ["Feeds 18–20", "Feeds 8–10"]);
  assert.deepEqual(sizesOf("PINCHOS"), ["12 pcs", "24 pcs", "48 pcs"]);
  assert.deepEqual(sizesOf("CHILLED SHRIMP SALAD"), ["Feeds 18–20", "Feeds 8–10"]);
  // Groups keep the position of their first member.
  assert.ok(trays[0].title.includes("BAKED MACARONI"));
  assert.equal(groupSizeVariants(t(Q_FAMILY)).length, 1);
  assert.equal(groupSizeVariants(t(Q_FAMILY))[0].members.length, 2);
});
check("groupSizeVariants: must-not-merge cases (a wrong merge hides a dish)", () => {
  const trays = groupSizeVariants(t(Q_TRAYS));
  // ROASTED vs HERB ROASTED are different dishes — two separate one-member groups.
  const roasted = trays.filter((g) => /ROASTED CHICKEN/.test(g.title));
  assert.equal(roasted.length, 2);
  for (const g of roasted) assert.equal(g.members.length, 1);
  // Identical titles with no size marker never merge.
  assert.equal(groupSizeVariants(t(["OXTAIL PLATE", "OXTAIL PLATE"])).length, 2);
  // Same size twice → ambiguous → never merge.
  assert.equal(groupSizeVariants(t(["TRAY X (FEEDS 8-10)", "TRAY X (FEEDS 8-10)"])).length, 2);
  // One sized + one unsized → never merge.
  assert.equal(groupSizeVariants(t(["TRAY X (FEEDS 8-10)", "TRAY X"])).length, 2);
  // Plates are never grouped by the page, but the helper alone is still safe on them.
  assert.equal(groupSizeVariants(t(Q_PLATES)).length, Q_PLATES.length);
});
check("isListingOpen: storefront and dashboard share one open-dish rule", () => {
  const today = "2026-10-19";
  assert.equal(isListingOpen({ fulfillment_mode: "lead_time", lead_days: 2 }, today), true);
  assert.equal(isListingOpen({ fulfillment_mode: "lead_time", lead_days: 2, limited_quantity: true, quantity_available: 0 }, today), false);
  assert.equal(isListingOpen({ fulfillment_mode: "lead_time", lead_days: 2, limited_quantity: true, quantity_available: null }, today), false);
  assert.equal(isListingOpen({ fulfillment_mode: "lead_time", lead_days: 2, limited_quantity: true, quantity_available: 3 }, today), true);
  // A Thanksgiving preorder past its order-by cutoff is closed.
  assert.equal(isListingOpen({ fulfillment_mode: "preorder", ready_date: "2026-11-25", order_by: "2026-10-18" }, today), false);
  // Open preorder inside the 30-day preorder horizon (Nov 25 would still be
  // too far out on Oct 19 — existing rule, not a closed dish).
  assert.equal(isListingOpen({ fulfillment_mode: "preorder", ready_date: "2026-11-10", order_by: "2026-11-05" }, today), true);
});
// ---- holiday pickup days (Oct 30 2026: Thanksgiving pickup wasn't bookable) ----
const Q_WINDOWS = ["Saturdays 2PM-5PM", "Sundays.  2PM to 5 PM"];
const TG_LINE = "Thanksgiving pickup: Wed, Nov 25, 2026 · 2PM-5PM";

check("dated pickup lines: recognized and resolved; weekly lines are not", () => {
  assert.equal(isDatedPickupWindow(TG_LINE), true);
  assert.equal(datedPickupWindowDate(TG_LINE, "2026-10-30"), "2026-11-25");
  assert.equal(datedPickupWindowDate("Christmas Eve, Dec 24th 10am-1pm", "2026-10-30"), "2026-12-24");
  assert.equal(datedPickupWindowDate("Pickup November 26 9-11 AM", "2026-10-30"), "2026-11-26");
  for (const w of [...Q_WINDOWS, "Weekends 10-2", "Fri 5-8pm", "Mon-Fri 9am to 5pm", "Sat & Sun evenings"]) {
    assert.equal(isDatedPickupWindow(w), false, w);
    assert.equal(datedPickupWindowDate(w, "2026-10-30"), null, w);
  }
  // Impossible dates are not dates.
  assert.equal(datedPickupWindowDate("Feb 30, 2027 noon", "2026-10-30"), null);
});
check("dated pickup lines: no year → this year, or next year once ~2 months gone", () => {
  assert.equal(datedPickupWindowDate("Jan 2 pickup 10-12", "2026-12-20"), "2027-01-02");
  assert.equal(datedPickupWindowDate("Nov 25 2-5pm", "2026-12-01"), "2026-11-25"); // just passed → expired, not next year
});
check("parsePickupDays: a holiday line never adds a weekly day", () => {
  const d = parsePickupDays([...Q_WINDOWS, TG_LINE]);
  assert.deepEqual([...d!].sort(), [0, 6]); // still Sat+Sun — not "every Wednesday"
  assert.equal(parsePickupDays([TG_LINE]), null); // only one-offs → no weekly schedule
});
check("activePickupWindows: a holiday line disappears after its day", () => {
  assert.deepEqual(activePickupWindows([...Q_WINDOWS, TG_LINE], "2026-11-25"), [...Q_WINDOWS, TG_LINE]);
  assert.deepEqual(activePickupWindows([...Q_WINDOWS, TG_LINE], "2026-11-26"), Q_WINDOWS);
});
check("holidaysForYear: Thanksgiving is the 4th Thursday of November", () => {
  assert.equal(holidaysForYear(2026)[0].date, "2026-11-26");
  assert.equal(holidaysForYear(2027)[0].date, "2027-11-25");
  assert.equal(holidaysForYear(2028)[0].date, "2028-11-23");
  assert.deepEqual(holidaysForYear(2026)[0].suggestions, ["2026-11-25", "2026-11-26"]);
});
check("upcomingHolidays: only the ones 2–42 days out", () => {
  assert.deepEqual(upcomingHolidays("2026-10-30").map((h) => h.key), ["thanksgiving-2026"]);
  assert.deepEqual(upcomingHolidays("2026-12-01").map((h) => h.key), ["christmas-2026", "new-years-eve-2026"]);
  assert.deepEqual(upcomingHolidays("2026-11-25").map((h) => h.key), ["christmas-2026", "new-years-eve-2026"]); // Thanksgiving is tomorrow — too late
});
check("holidayNudge: Chef Q's weekend schedule is asked about Wed 25 / Thu 26", () => {
  const n = holidayNudge(Q_WINDOWS, "2026-10-30");
  assert.equal(n?.holiday.key, "thanksgiving-2026");
  assert.deepEqual(n?.suggestions, ["2026-11-25", "2026-11-26"]);
});
check("holidayNudge: handled once she adds a day, or when her week already covers it", () => {
  assert.equal(holidayNudge([...Q_WINDOWS, TG_LINE], "2026-10-30"), null);
  // A kitchen that already hands off on Wednesdays and Thursdays has nothing to add.
  assert.equal(holidayNudge(["Wed & Thu 4-7pm"], "2026-10-30"), null);
  // Covers Wednesday only → still asked about Thanksgiving Day itself.
  assert.deepEqual(holidayNudge(["Wednesdays 4-7pm"], "2026-10-30")?.suggestions, ["2026-11-26"]);
  assert.equal(holidayNudge([], "2026-08-01"), null); // no holiday within 6 weeks
  // No pickup times at all: buyers already pick any date, so nothing to ask.
  assert.equal(holidayNudge([], "2026-10-30"), null);
  assert.equal(holidayNudge(["Halloween pickup: Sat, Oct 24, 2026 · 2PM-5PM"], "2026-10-30"), null);
});
check("weeklyPickupHours: her usual hours, lifted from the weekly line", () => {
  assert.equal(weeklyPickupHours(Q_WINDOWS), "2PM-5PM");
  assert.equal(weeklyPickupHours(["Sundays.  2PM to 5 PM"]), "2PM to 5 PM");
  assert.equal(weeklyPickupHours([TG_LINE, "Saturdays 11AM-10 PM"]), "11AM-10 PM");
  assert.equal(weeklyPickupHours(["Weekends"]), null);
});
check("holidayPickupLine: round-trips through the parser and fits the 80-char limit", () => {
  const line = holidayPickupLine("Thanksgiving pickup", "2026-11-25", "2PM-5PM");
  assert.equal(line, TG_LINE);
  assert.equal(datedPickupWindowDate(line, "2026-10-30"), "2026-11-25");
  const long = holidayPickupLine("New Year's Eve pickup", "2026-12-31", "x".repeat(60));
  assert.ok(long.length <= 80);
  assert.equal(datedPickupWindowDate(long, "2026-10-30"), "2026-12-31");
});
// Chef Q's real saved pickup times (Oct 30 2026): a day line, then its slot times.
const Q_LIVE = ["Saturdays", "2 PM", "2:30 PM", "3 PM", "3:30PM", "4 PM", "4:30 PM", "5 PM", "5:30 PM", "Sundays"];
const Q_SLOTS = Q_LIVE.slice(1, 9);

check("slot layout: a day line with times under it becomes one choice per slot", () => {
  assert.deepEqual(expandPickupWindows(Q_LIVE), [...Q_SLOTS.map((t) => `Saturdays ${t}`), "Sundays"]);
  // Idempotent: an expanded list reads back unchanged.
  assert.deepEqual(expandPickupWindows(expandPickupWindows(Q_LIVE)), expandPickupWindows(Q_LIVE));
  // One-line windows are untouched.
  assert.deepEqual(expandPickupWindows(Q_WINDOWS), Q_WINDOWS);
});
check("slot layout: her schedule reads as Saturdays and Sundays again", () => {
  assert.deepEqual([...parsePickupDays(Q_LIVE)!].sort(), [0, 6]);
  assert.equal(pickupDaysSentence(parsePickupDays(Q_LIVE)), "Saturdays and Sundays");
  // Each slot carries its own day, for the checkout date picker.
  assert.deepEqual([...parsePickupDays(["Saturdays 2:30 PM"])!], [6]);
  // A ready-now dish on Friday Oct 30 promises Saturday, not a weekday.
  assert.equal(computeGetIt({ mode: "ready_now" }, "2026-10-30", parsePickupDays(Q_LIVE)), "2026-10-31");
});
check("slot layout: buyers see a day's slots as one span", () => {
  assert.deepEqual(pickupScheduleSummary(Q_LIVE), ["Saturdays 2 PM to 5:30 PM", "Sundays"]);
  assert.equal(pickupSlotsLabel(["11 AM", "4 PM"]), "11 AM, 4 PM"); // a few slots: listed
  assert.equal(pickupSlotsLabel(["4 PM", "2 PM", "3 PM", "5 PM"]), "4 PM, 2 PM, 3 PM, 5 PM"); // out of order: listed
  assert.equal(pickupSlotsLabel(["11am", "noon", "12:30 pm", "1 p.m."]), "11am to 1 p.m.");
  assert.equal(weeklyPickupHours(Q_LIVE), "2 PM to 5:30 PM");
  assert.equal(weeklyPickupHours(["Saturdays: 2:30PM-5PM"]), "2:30PM-5PM"); // a time's colon survives
});
check("holiday day for a slot kitchen: same slots, bookable, gone after the day", () => {
  const tg = holidayPickupLines("Thanksgiving pickup", "2026-11-25", Q_LIVE);
  assert.deepEqual(tg, ["Thanksgiving pickup: Wed, Nov 25, 2026", ...Q_SLOTS]);
  const saved = [...Q_LIVE, ...tg];
  const pick = "Thanksgiving pickup: Wed, Nov 25, 2026 · 2:30 PM";
  assert.ok(pickupChoices(saved, "2026-10-30").includes(pick));
  assert.equal(datedPickupWindowDate(pick, "2026-10-30"), "2026-11-25");
  assert.deepEqual([...parsePickupDays(saved)!].sort(), [0, 6]); // still not "every Wednesday"
  assert.equal(holidayNudge(saved, "2026-10-30"), null); // Thanksgiving is handled
  assert.deepEqual(pickupScheduleSummary(activePickupWindows(saved, "2026-11-25")), [
    "Saturdays 2 PM to 5:30 PM",
    "Sundays",
    "Thanksgiving pickup: Wed, Nov 25, 2026 · 2 PM to 5:30 PM",
  ]);
  // After the day the date line AND its slot times go, so no leftover time
  // lands under another day.
  assert.deepEqual(activePickupWindows(saved, "2026-11-26"), Q_LIVE);
  assert.ok(!pickupChoices(saved, "2026-11-26").some((c) => c.includes("Thanksgiving")));
  // A one-line kitchen still gets one line at its usual hours.
  assert.deepEqual(holidayPickupLines("Thanksgiving pickup", "2026-11-25", Q_WINDOWS), [TG_LINE]);
});
check("pickupChoiceLabel: a holiday slot leads with its date and time on a phone", () => {
  const t = "2026-10-30";
  assert.equal(pickupChoiceLabel("Thanksgiving pickup: Wed, Nov 25, 2026 · 2:30 PM", t), "Wed, Nov 25 · 2:30 PM · Thanksgiving");
  assert.equal(pickupChoiceLabel(TG_LINE, t), "Wed, Nov 25 · 2PM-5PM · Thanksgiving");
  assert.equal(pickupChoiceLabel("Thanksgiving pickup: Wed, Nov 25, 2026", t), "Wed, Nov 25 · Thanksgiving");
  // Weekly choices and hand-typed dated lines show as written.
  assert.equal(pickupChoiceLabel("Saturdays 2:30 PM", t), "Saturdays 2:30 PM");
  assert.equal(pickupChoiceLabel("Christmas Eve, Dec 24th 10am-1pm", t), "Christmas Eve, Dec 24th 10am-1pm");
});
check("holidayNudge: her real layout is asked about Thanksgiving", () => {
  assert.deepEqual(holidayNudge(Q_LIVE, "2026-10-30")?.suggestions, ["2026-11-25", "2026-11-26"]);
});
check("slot layout: lines it can't place keep the old safe fallback", () => {
  // A time with no day line above it still makes the schedule unknown.
  assert.equal(parsePickupDays(["2 PM", "Saturdays"]), null);
  // A line that already has a time doesn't take the line below as its slot.
  assert.deepEqual(expandPickupWindows(["Saturdays 2PM-5PM", "6 PM"]), ["Saturdays 2PM-5PM", "6 PM"]);
});
check("feedsRange: trays bridge reads 'for 8–20 people'", () => {
  assert.equal(feedsRange(Q_TRAYS), "8–20");
  assert.equal(feedsRange(["SOUTHEN OXTAILS & GRAVY FEAST (FEEDS 1)"]), "1");
  assert.equal(feedsRange(["PINCHOS -48 EA", "SEAFOOD SALAD"]), null);
});
check("feeds badge: parsed out of the title, first range wins", () => {
  assert.deepEqual(splitFeedsFromTitle("BUFFET STYLE: BBQ CHICKEN (FEEDS 18-20/40-45PCS)"),
    { title: "BUFFET STYLE: BBQ CHICKEN", feeds: "Feeds 18–20" });
  assert.deepEqual(splitFeedsFromTitle("CHILLED SHRIMP SALAD (SMALL FEEDS 8-10)"),
    { title: "CHILLED SHRIMP SALAD", feeds: "Feeds 8–10" });
  assert.deepEqual(splitFeedsFromTitle("THE CLASSIC SOUL FOOD DINNER (Serves 4-6)"),
    { title: "THE CLASSIC SOUL FOOD DINNER", feeds: "Feeds 4–6" });
  assert.equal(splitFeedsFromTitle("SOUTHEN OXTAILS & GRAVY FEAST (FEEDS 1)").feeds, "Feeds 1");
});
check("feeds badge: no parenthetical, odd input -> untouched title, null feeds", () => {
  assert.deepEqual(splitFeedsFromTitle("CANDIED YAMS"), { title: "CANDIED YAMS", feeds: null });
  assert.deepEqual(splitFeedsFromTitle("40 oz SIGNATURE SEAFOOD GUMBO NO CRAB (40 OZ / 1-2 Servings)").feeds, null);
  assert.equal(splitFeedsFromTitle("").title, "");
  assert.equal(splitFeedsFromTitle("( FEEDS )").feeds, null);
  // Nested parens are unrepresentable — degrade to untouched title, no chip.
  assert.deepEqual(splitFeedsFromTitle("JAMBALAYA (FEEDS 18-20 (two half-pans))"),
    { title: "JAMBALAYA (FEEDS 18-20 (two half-pans))", feeds: null });
});
check("cookTagline: tagline wins, bio first-sentence fallback, caps at one line", () => {
  assert.equal(cookTagline("Soul food with sazón.", "Long bio here."), "Soul food with sazón.");
  assert.equal(
    cookTagline(null, "40 Acres Soul Kitchen is a permitted home-based food business. More text follows."),
    "40 Acres Soul Kitchen is a permitted home-based food business.");
  assert.equal(cookTagline("  ", null), null);
  assert.equal(cookTagline(null, "No terminal punctuation at all"), "No terminal punctuation at all");
  const long = "A".repeat(200) + ". rest";
  assert.equal(cookTagline(null, long)!.length <= 120, true);
  assert.equal(cookTagline(null, long)!.endsWith("…"), true);
  // Abbreviations must not become the storefront line (review finding).
  assert.equal(
    cookTagline(null, "Mr. Smith's kitchen has fed Campbell for 20 years. Come hungry."),
    "Mr. Smith's kitchen has fed Campbell for 20 years.");
  assert.equal(
    cookTagline(null, "Born in St. Louis, raised on BBQ. Now in San Jose."),
    "Born in St. Louis, raised on BBQ.");
  assert.equal(
    cookTagline(null, "I've cooked professionally for 3.5 years in Oakland kitchens!"),
    "I've cooked professionally for 3.5 years in Oakland kitchens!");
  assert.equal(cookTagline(null, "...."), null);
});
check("pickupDaysLabel: limited schedules get a short label", () => {
  assert.equal(pickupDaysLabel(new Set([6])), "Sats");
  assert.equal(pickupDaysLabel(new Set([0, 6])), "Sun & Sat");
  assert.equal(pickupDaysLabel(new Set([5, 6, 0])), "Sun, Fri & Sat");
  // Chef Q's real weekend schedule, end to end.
  assert.equal(
    pickupDaysLabel(parsePickupDays(["Saturdays 11AM-10 PM", "Sundays 2-7"])),
    "Sun & Sat"
  );
});
check("pickupDaysLabel: unknown or 7-day schedule → null (no warning)", () => {
  assert.equal(pickupDaysLabel(new Set([0, 1, 2, 3, 4, 5, 6])), null); // daily
  assert.equal(pickupDaysLabel(parsePickupDays(["daily 9-5"])), null);
  assert.equal(pickupDaysLabel(null), null);
  assert.equal(pickupDaysLabel(new Set()), null);
});
check("nextHandoffIso: pushes to the next scheduled day", () => {
  const satSun = new Set([0, 6]);
  assert.equal(nextHandoffIso("2026-08-07", satSun), "2026-08-08"); // Fri → Sat
  assert.equal(nextHandoffIso("2026-08-08", satSun), "2026-08-08"); // Sat stays
  assert.equal(nextHandoffIso("2026-08-10", satSun), "2026-08-15"); // Mon → next Sat
});
check("getIt: ready_now on a non-handoff day → next pickup day", () => {
  const days = parsePickupDays(["Saturdays 11AM-10 PM", "Sundays 2PM to 7 PM"]);
  // Friday, zero-notice dish, weekend-only kitchen → Saturday, not today.
  assert.equal(computeGetIt({ mode: "ready_now" }, TODAY, days), "2026-08-08");
  const b = availabilityBadge({ mode: "ready_now" }, TODAY, days);
  assert.equal(b.tone, "soon");
  assert.equal(b.text, "Get it Sat, Aug 8");
});
check("getIt: lead time composes with handoff days", () => {
  const days = new Set([0, 6]);
  // Fri + 3 days notice → ready Mon → next handoff = Sat Aug 15.
  assert.equal(
    computeGetIt({ mode: "lead_time", leadDays: 3 }, TODAY, days),
    "2026-08-15"
  );
});
check("getIt: same-day only when chef said zero notice AND today is a handoff day", () => {
  const days = new Set([0, 6]);
  const sat = "2026-08-08";
  assert.equal(computeGetIt({ mode: "ready_now" }, sat, days), sat);
  assert.equal(availabilityBadge({ mode: "ready_now" }, sat, days).text, "Get it today");
});
check("badge: preorder date is the cook's word — NEVER pushed by windows", () => {
  const days = new Set([0, 6]);
  // Cook set Thu Aug 20 (a one-off event day) at a weekend-windows kitchen:
  // the explicit date wins; the weekly heuristic must not rewrite it.
  const b = availabilityBadge(
    { mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-18" },
    TODAY,
    days
  );
  assert.equal(b.text, "Get it Thu, Aug 20 · order by Tue, Aug 18");
});
check("parsePickupDays: day RANGES expand inclusively", () => {
  assert.deepEqual([...parsePickupDays(["Mon-Fri 5-8pm"])!].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual([...parsePickupDays(["Tuesday through Thursday"])!].sort(), [2, 3, 4]);
  assert.deepEqual([...parsePickupDays(["Fri-Mon"])!].sort(), [0, 1, 5, 6]); // wraps the week
});
check("parsePickupDays: frequency/negation qualifiers → null (can't represent)", () => {
  assert.equal(parsePickupDays(["1st Saturday of the month"]), null);
  assert.equal(parsePickupDays(["Every other Saturday 11-2"]), null);
  assert.equal(parsePickupDays(["Fri 5-8pm", "Closed Sundays"]), null);
  assert.equal(parsePickupDays(["Weekends", "No pickup Mondays"]), null);
});
check("badge: unknown schedule (null days) falls back to plain ready-by", () => {
  const b = availabilityBadge({ mode: "ready_now" }, TODAY, null);
  assert.equal(b.text, "Get it today");
});
check("badge: preorder open → date tone", () =>
  assert.equal(availabilityBadge({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-18" }, TODAY).tone, "date"));
check("badge: preorder closed → closed tone", () =>
  assert.equal(availabilityBadge({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-05" }, TODAY).tone, "closed"));

// ---- image optimization (lib/image.ts) ----

checkAsync("optimize: big photo shrinks to ≤1600 edge, webp", async () => {
  const big = await sharp({
    create: { width: 3000, height: 2000, channels: 3, background: { r: 180, g: 90, b: 40 } },
  })
    .png()
    .toBuffer();
  const out = await optimizeImageBuffer(big);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.ok((meta.width ?? 0) <= 1600 && (meta.height ?? 0) <= 1600);
  // aspect preserved (3:2)
  assert.ok(Math.abs((meta.width ?? 0) / (meta.height ?? 1) - 1.5) < 0.01);
});

checkAsync("optimize: small photo is never upscaled", async () => {
  const small = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 20, g: 120, b: 80 } },
  })
    .jpeg()
    .toBuffer();
  const out = await optimizeImageBuffer(small);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 400);
  assert.equal(meta.height, 300);
});

// ---- refund hold on cook-cancelled orders (Nov 2026: buyers waited up to a week) ----
const HOUR = 3_600_000;
const T0 = Date.parse("2026-11-25T20:00:00Z"); // "now" for these tests
const iso = (msAgo: number) => new Date(T0 - msAgo).toISOString();
// A cancelled, paid order as the Orders page and the sweep see it.
const cancelledOrder = (o: Record<string, unknown> = {}) => ({
  status: "cancelled",
  stripe_payment_intent_id: "pi_123",
  refunded_at: null,
  cancelled_at: iso(2 * HOUR),
  refund_claimed_at: null,
  refund_failed_at: null,
  ...o,
});

check("refund hold: a day; a claim goes stale after ten minutes; failures back off half a day", () => {
  assert.equal(REFUND_HOLD_HOURS, 24);
  assert.equal(REFUND_CLAIM_STALE_MINUTES, 10);
  assert.equal(REFUND_RETRY_HOURS, 12);
});
check("refundState: only a cancelled, paid, unrefunded, unclaimed order is 'held'", () => {
  assert.equal(refundState(cancelledOrder(), T0), "held");
  for (const status of ["confirmed", "in_progress", "ready", "completed", "pending"]) {
    assert.equal(refundState(cancelledOrder({ status }), T0), "none", status);
  }
  // Cancelled but never paid: nothing to refund.
  assert.equal(refundState(cancelledOrder({ stripe_payment_intent_id: null }), T0), "none");
  // Refunded wins over everything, including a leftover claim.
  assert.equal(refundState(cancelledOrder({ refunded_at: iso(HOUR), refund_claimed_at: iso(HOUR) }), T0), "refunded");
  assert.equal(refundState({ status: "completed", refunded_at: iso(HOUR), stripe_payment_intent_id: "pi" }, T0), "refunded");
});
check("refundState: a claim is 'sending' for ten minutes, then 'stalled' — on ANY order", () => {
  assert.equal(refundState(cancelledOrder({ refund_claimed_at: iso(30_000) }), T0), "sending");
  assert.equal(refundState(cancelledOrder({ refund_claimed_at: iso(9 * 60_000 + 59_000) }), T0), "sending");
  assert.equal(refundState(cancelledOrder({ refund_claimed_at: iso(10 * 60_000) }), T0), "stalled");
  assert.equal(refundState(cancelledOrder({ refund_claimed_at: iso(3 * HOUR) }), T0), "stalled");
  // An admin's refund of a still-active (or completed) order can stall too.
  for (const status of ["confirmed", "in_progress", "ready", "completed"]) {
    assert.equal(refundState(cancelledOrder({ status, refund_claimed_at: iso(60_000) }), T0), "sending", status);
    assert.equal(refundState(cancelledOrder({ status, refund_claimed_at: iso(HOUR) }), T0), "stalled", status);
  }
  // A claim we can't read as a time is still a claim: never "held".
  assert.equal(refundState(cancelledOrder({ refund_claimed_at: "garbage" }), T0), "stalled");
  // …but never for an unpaid order.
  assert.equal(refundState(cancelledOrder({ stripe_payment_intent_id: null, refund_claimed_at: iso(HOUR) }), T0), "none");
});
check("refundDueAt: 24 hours after the cancel; unknown cancel time has no due time", () => {
  assert.equal(refundDueAt("2026-11-25T18:00:00.000Z"), "2026-11-26T18:00:00.000Z");
  // The database's own timestamp format (microseconds, numeric offset).
  assert.equal(refundDueAt("2026-11-25T18:00:00.123456+00:00"), "2026-11-26T18:00:00.123Z");
  assert.equal(refundDueAt(null), null);
  assert.equal(refundDueAt(undefined), null);
  assert.equal(refundDueAt("not a date"), null);
});
check("isRefundDue: the sweep waits out the full hold", () => {
  assert.equal(isRefundDue(cancelledOrder({ cancelled_at: iso(1 * HOUR) }), T0), false);
  assert.equal(isRefundDue(cancelledOrder({ cancelled_at: iso(24 * HOUR - 1000) }), T0), false);
  assert.equal(isRefundDue(cancelledOrder({ cancelled_at: iso(24 * HOUR) }), T0), true);
  assert.equal(isRefundDue(cancelledOrder({ cancelled_at: iso(40 * HOUR) }), T0), true);
});
check("isRefundDue: never automatic without a known cancel time, payment, or cancel", () => {
  // Cancelled before migration 45 (no stamp): a person must decide.
  assert.equal(isRefundDue(cancelledOrder({ cancelled_at: null }), T0), false);
  assert.equal(isRefundDue(cancelledOrder({ cancelled_at: "garbage" }), T0), false);
  const old = { cancelled_at: iso(48 * HOUR) };
  assert.equal(isRefundDue(cancelledOrder({ ...old, stripe_payment_intent_id: null }), T0), false);
  assert.equal(isRefundDue(cancelledOrder({ ...old, refunded_at: iso(HOUR) }), T0), false);
  // Put back on (or never cancelled) and no refund ever started: not the
  // sweep's business, however old.
  for (const status of ["confirmed", "in_progress", "ready", "completed"]) {
    assert.equal(isRefundDue(cancelledOrder({ ...old, status }), T0), false, status);
  }
});
check("isRefundDue: a refund in flight is left alone; a stuck one is finished at once", () => {
  const overdue = { cancelled_at: iso(30 * HOUR) };
  assert.equal(isRefundDue(cancelledOrder({ ...overdue, refund_claimed_at: iso(60_000) }), T0), false);
  // Started (by the cook's Refund now) one hour into the hold and never
  // finished: don't make the buyer wait out a hold nobody can undo anymore.
  assert.equal(isRefundDue(cancelledOrder({ cancelled_at: iso(1 * HOUR), refund_claimed_at: iso(20 * 60_000) }), T0), true);
  // An admin's refund of an ACTIVE order that never reported back must be
  // finished too — otherwise the order sits active with the money gone.
  assert.equal(isRefundDue(cancelledOrder({ status: "ready", cancelled_at: null, refund_claimed_at: iso(20 * 60_000) }), T0), true);
  assert.equal(isRefundDue(cancelledOrder({ status: "completed", cancelled_at: null, refund_claimed_at: iso(HOUR) }), T0), true);
});
check("isRefundDue: after a failed attempt the sweep backs off for twelve hours", () => {
  const overdue = { cancelled_at: iso(30 * HOUR) };
  assert.equal(isRefundDue(cancelledOrder({ ...overdue, refund_failed_at: iso(60_000) }), T0), false);
  assert.equal(isRefundDue(cancelledOrder({ ...overdue, refund_failed_at: iso(12 * HOUR - 1000) }), T0), false);
  assert.equal(isRefundDue(cancelledOrder({ ...overdue, refund_failed_at: iso(12 * HOUR) }), T0), true);
  // The same back-off applies to a stuck refund (Stripe may replay a cached
  // error for a day; hammering it helps nobody).
  const stuck = { refund_claimed_at: iso(2 * HOUR) };
  assert.equal(isRefundDue(cancelledOrder({ ...stuck, refund_failed_at: iso(2 * HOUR) }), T0), false);
  assert.equal(isRefundDue(cancelledOrder({ ...stuck, refund_failed_at: iso(13 * HOUR) }), T0), true);
  // An unreadable failure time is no reason to stop refunding.
  assert.equal(isRefundDue(cancelledOrder({ ...overdue, refund_failed_at: "garbage" }), T0), true);
});
check("undo / refund-now: undo only while no refund ever started", () => {
  const held = cancelledOrder();
  const sending = cancelledOrder({ refund_claimed_at: iso(60_000) });
  const stalled = cancelledOrder({ refund_claimed_at: iso(HOUR) });
  const refunded = cancelledOrder({ refunded_at: iso(HOUR) });
  const active = cancelledOrder({ status: "confirmed" });
  const failedOnce = cancelledOrder({ refund_failed_at: iso(60_000) }); // Stripe said no: undo is safe again
  assert.deepEqual([held, sending, stalled, refunded, active, failedOnce].map((o) => canUndoCancel(o, T0)), [true, false, false, false, false, true]);
  assert.deepEqual([held, sending, stalled, refunded, active, failedOnce].map((o) => canRefundNow(o, T0)), [true, false, true, false, false, true]);
});
check("isMissingHoldColumn: ONLY 'that hold column does not exist' counts as not-migrated", () => {
  // What Postgres / PostgREST really answer before migration 45 (checked live).
  assert.equal(isMissingHoldColumn({ code: "42703", message: "column orders.cancelled_at does not exist" }), true);
  assert.equal(isMissingHoldColumn({ code: "42703", message: "column orders.refund_claimed_at does not exist" }), true);
  assert.equal(isMissingHoldColumn({ code: "42703", message: 'column "refund_failed_at" of relation "orders" does not exist' }), true);
  assert.equal(isMissingHoldColumn({ code: "PGRST204", message: "Could not find the 'refund_claimed_at' column of 'orders' in the schema cache" }), true);
  // Everything else is a real error and must fail closed — reading any of
  // these as "not migrated" would silently drop the refund/undo guard.
  assert.equal(isMissingHoldColumn({ code: "PGRST002", message: "Could not query the database for the schema cache. Retrying." }), false);
  assert.equal(isMissingHoldColumn({ code: "PGRST204", message: "Could not find the 'whatever' column of 'orders' in the schema cache" }), false);
  assert.equal(isMissingHoldColumn({ code: "42703", message: "column orders.something_else does not exist" }), false);
  assert.equal(isMissingHoldColumn({ code: "57014", message: "canceling statement due to statement timeout" }), false);
  assert.equal(isMissingHoldColumn({ code: "42501", message: "permission denied for table orders (refund_claimed_at)" }), false);
  assert.equal(isMissingHoldColumn({ message: "column orders.cancelled_at does not exist" }), false); // no code: not sure enough
  assert.equal(isMissingHoldColumn({ code: "42703" }), false);
  assert.equal(isMissingHoldColumn(null), false);
  assert.equal(isMissingHoldColumn(undefined), false);
});
check("formatHoldTime: shown in Pacific time, whatever the server's clock", () => {
  assert.equal(formatHoldTime("2026-11-26T22:15:00.000Z"), "Thu, Nov 26, 2:15 PM");
  // 03:30 UTC is still the evening before in California.
  assert.equal(formatHoldTime("2026-11-27T03:30:00.000Z"), "Thu, Nov 26, 7:30 PM");
  // Summer time is handled by the zone, not by us.
  assert.equal(formatHoldTime("2026-07-04T19:00:00.000Z"), "Sat, Jul 4, 12:00 PM");
  // Plain spaces only (newer runtimes emit a narrow no-break space before AM/PM).
  assert.ok(!/[  ]/.test(formatHoldTime("2026-11-26T22:15:00.000Z")));
});

// createRefund (lib/stripe.ts): what it sends, and how it classifies answers.
// "uncertain" is what keeps an order locked against an undo, so it must be
// neither too wide (a clean "no" would lock the order) nor too narrow (a
// refund that may have gone through would be treated as "nothing happened").
async function withStripe<T>(
  respond: (url: string, init: any) => Promise<Response> | Response,
  run: () => Promise<T>
): Promise<{ result: T; calls: { url: string; init: any }[] }> {
  const realFetch = globalThis.fetch;
  const realKey = process.env.STRIPE_SECRET_KEY;
  const calls: { url: string; init: any }[] = [];
  process.env.STRIPE_SECRET_KEY = "sk_test_unit";
  (globalThis as any).fetch = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init);
  };
  try {
    return { result: await run(), calls };
  } finally {
    (globalThis as any).fetch = realFetch;
    if (realKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = realKey;
  }
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

checkAsync("createRefund: always reverses the transfer + returns the fee, keyed by the order id", async () => {
  const { result, calls } = await withStripe(() => json(200, { id: "re_1" }), () => createRefund("pi_abc", "order-1"));
  assert.deepEqual(result, { id: "re_1" });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/refunds"));
  const body = new URLSearchParams(String(calls[0].init.body));
  assert.equal(body.get("payment_intent"), "pi_abc");
  assert.equal(body.get("reverse_transfer"), "true");
  assert.equal(body.get("refund_application_fee"), "true");
  assert.equal(calls[0].init.headers["Idempotency-Key"], "refund-order-1");
  assert.equal(calls[0].init.method, "POST");
});
checkAsync("createRefund: a clear refusal is definite and carries Stripe's code", async () => {
  for (const [status, code] of [[400, "charge_already_refunded"], [400, "charge_disputed"], [402, "card_declined"], [401, undefined], [404, "resource_missing"]] as const) {
    const { result } = await withStripe(() => json(status, { error: { message: "no", code } }), () => createRefund("pi", "o"));
    assert.ok("error" in result, String(status));
    assert.equal((result as any).uncertain, false, `${status} must be a definite no`);
    assert.equal((result as any).code, code, String(status));
  }
});
checkAsync("createRefund: anything that might have gone through is 'uncertain'", async () => {
  // Stripe unreachable / the call timing out.
  const thrown = await withStripe(() => { throw new Error("socket hang up"); }, () => createRefund("pi", "o"));
  assert.equal((thrown.result as any).uncertain, true);
  // Server errors, a same-key request still in flight, rate limiting.
  for (const status of [500, 502, 503, 409, 429]) {
    const { result } = await withStripe(() => json(status, { error: { message: "x", code: status === 409 ? "idempotency_key_in_use" : undefined } }), () => createRefund("pi", "o"));
    assert.equal((result as any).uncertain, true, String(status));
  }
  // A 2xx we couldn't read: Stripe said yes to something.
  const noId = await withStripe(() => json(200, {}), () => createRefund("pi", "o"));
  assert.equal((noId.result as any).uncertain, true);
  const notJson = await withStripe(() => new Response("<html>gateway</html>", { status: 200 }), () => createRefund("pi", "o"));
  assert.equal((notJson.result as any).uncertain, true);
});
checkAsync("createRefund: no Stripe key means nothing was sent (a definite no)", async () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.STRIPE_SECRET_KEY;
  let called = 0;
  (globalThis as any).fetch = async () => { called++; return json(200, { id: "re" }); };
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const r = await createRefund("pi", "o");
    assert.ok("error" in r);
    assert.ok(!(r as any).uncertain);
    assert.equal(called, 0);
  } finally {
    (globalThis as any).fetch = realFetch;
    if (realKey !== undefined) process.env.STRIPE_SECRET_KEY = realKey;
  }
});

checkAsync("optimize: garbage input rejects (upload falls back to original)", async () => {
  await assert.rejects(() => optimizeImageBuffer(Buffer.from("not an image")));
});

checkAsync("optimize: decompression bomb (>40MP) rejects at header parse", async () => {
  // 9000x9000 = 81MP — over the 40MP cap; must throw, never decode.
  const bomb = await sharp({
    create: { width: 9000, height: 9000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    limitInputPixels: false,
  })
    .png()
    .toBuffer();
  await assert.rejects(() => optimizeImageBuffer(bomb));
});

Promise.all(pending).then(() => {
  console.log("\n" + pass + " passed, " + fail + " failed");
  if (fail > 0) process.exit(1);
});
