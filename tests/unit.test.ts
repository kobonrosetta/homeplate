import assert from "node:assert";
import { slugify } from "../lib/slug";
import {
  calcServiceFeeCents,
  calcTotalCents,
  formatUsd,
} from "../lib/constants";

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

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
