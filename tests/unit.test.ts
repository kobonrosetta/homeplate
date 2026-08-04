import assert from "node:assert";
import { slugify } from "../lib/slug";
import {
  calcServiceFeeCents,
  calcTotalCents,
  formatUsd,
} from "../lib/constants";
import {
  normalizePermit,
  namesMatch,
  nameMatchTier,
  isExpired,
} from "../lib/match";
import { deriveUnitPrice, cartLineKey } from "../lib/options";
import { accountStatus } from "../lib/stripe";
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
} from "../lib/availability";

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

// --- slug logic ---
check("slugify: basic", () => assert.equal(slugify("Kate's Bread"), "kates-bread"));
check("slugify: collapses spaces/punctuation", () =>
  assert.equal(slugify("  The   Daily  Loaf!! "), "the-daily-loaf"));
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
check("validate: valid preorder ok", () =>
  assert.equal(validateAvailability({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-18" }, TODAY), null));

// badges
check("badge: ready_now → Ready today / now", () => {
  const b = availabilityBadge({ mode: "ready_now" }, TODAY);
  assert.equal(b.tone, "now");
  assert.equal(b.text, "Ready today");
});
check("badge: lead_time → soon + a date", () => {
  const b = availabilityBadge({ mode: "lead_time", leadDays: 2 }, TODAY);
  assert.equal(b.tone, "soon");
  assert.ok(b.text.startsWith("Ready by "));
});
check("badge: preorder open → date tone", () =>
  assert.equal(availabilityBadge({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-18" }, TODAY).tone, "date"));
check("badge: preorder closed → closed tone", () =>
  assert.equal(availabilityBadge({ mode: "preorder", readyDate: "2026-08-20", orderBy: "2026-08-05" }, TODAY).tone, "closed"));

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
