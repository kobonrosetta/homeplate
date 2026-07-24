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

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
