// Runs migration 45 (supabase/add-order-refund-hold.sql) VERBATIM on a real
// Postgres engine (PGlite, in-process), on top of the production order guard
// (migrations 16 + 18, also read verbatim from this repo), and checks the
// behavior the refund hold depends on. Nothing here touches Supabase.
// How to run: see README.md in this folder.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const read = (f) =>
  readFileSync(new URL(`../../supabase/${f}`, import.meta.url), "utf8");
const db = new PGlite();
const out = [];
let failed = 0;
const ok = (c, label, d = "") => {
  if (!c) failed++;
  out.push(`${c ? "PASS" : "FAIL"}  ${label}${d ? "  — " + d : ""}`);
};
const q = async (sql, params) => (await db.query(sql, params)).rows;
// Run a statement as a given Postgres role, the way PostgREST does.
const as = async (role, sql, params) => {
  await db.exec(`set role ${role}`);
  try {
    return { rows: await q(sql, params) };
  } catch (e) {
    return { error: String(e.message) };
  } finally {
    await db.exec("reset role");
  }
};

// ---- A stand-in for production: the roles, the enum (with 'in_progress'),
// and an orders table with production's columns as of migration 44.
await db.exec(`
  create role authenticated; create role anon; create role service_role;
  create type order_status as enum ('pending','confirmed','in_progress','ready','completed','cancelled');
  create table orders (
    id uuid primary key default gen_random_uuid(),
    buyer_id uuid, cook_id uuid,
    status order_status not null default 'pending',
    fulfillment text, subtotal_cents integer, service_fee_cents integer, total_cents integer,
    stripe_payment_intent_id text, pickup_time text, notes text,
    contact_name text, contact_phone text, contact_email text, delivery_address text,
    ready_by_date date, event_date date, custom_request_id uuid,
    reminder_sent_at timestamptz, refunded_at timestamptz,
    created_at timestamptz not null default now()
  );
  grant all on orders to authenticated, anon, service_role;
`);

// ---- The production guard, verbatim: function from migration 18, trigger
// statement from migration 16.
const inProgress = read("add-order-in-progress.sql");
const guardFn = inProgress.slice(
  inProgress.indexOf("create or replace function public.enforce_order_update_rules()")
);
ok(guardFn.includes("only order status may be changed"), "loaded the production guard function from migration 18");
await db.exec(guardFn);
const harden = read("harden-orders.sql");
const trigStart = harden.indexOf("drop trigger if exists orders_guard_update on orders;");
const trigEnd = harden.indexOf(";", harden.indexOf("create trigger orders_guard_update")) + 1;
await db.exec(harden.slice(trigStart, trigEnd));

const newOrder = async (status) =>
  (
    await q(
      `insert into orders (status, subtotal_cents, service_fee_cents, total_cents, stripe_payment_intent_id)
       values ($1, 3600, 318, 3918, 'pi_test') returning id`,
      [status]
    )
  )[0].id;
const row = async (id) => (await q("select * from orders where id = $1", [id]))[0];

// ---- BEFORE the migration: the app's fallbacks rely on these exact failures.
{
  const id = await newOrder("confirmed");
  const r = await as("service_role", "update orders set refund_claimed_at = now() where id = $1 returning id", [id]);
  ok(/column "refund_claimed_at".*does not exist/i.test(r.error ?? ""), "before migration: claiming fails with 'column does not exist' (app falls back)", r.error);
  const c = await as("authenticated", "update orders set status = 'cancelled' where id = $1 returning id", [id]);
  ok(c.rows?.length === 1, "before migration: a cook can cancel as today");
}

// ---- Apply migration 45 verbatim, twice (it must be safe to re-run).
const migration = read("add-order-refund-hold.sql");
for (const pass of [1, 2]) {
  const results = await db.exec(migration);
  const check = results[results.length - 1].rows[0];
  ok(
    Number(check.hold_columns_should_be_3) === 3 &&
      check.update_triggers_in_firing_order === "orders_guard_update -> orders_stamp_cancelled_at",
    `migration 45 runs clean (pass ${pass}) and its self-check reads right`,
    JSON.stringify(check)
  );
}

// ---- A cook session (role 'authenticated') cancelling.
{
  const id = await newOrder("confirmed");
  const before = Date.now();
  const r = await as("authenticated", "update orders set status = 'cancelled' where id = $1 returning id", [id]);
  const o = await row(id);
  ok(r.rows?.length === 1 && o.status === "cancelled", "cook cancel still works with both triggers in place", r.error ?? "");
  const stamped = o.cancelled_at ? new Date(o.cancelled_at).getTime() : 0;
  ok(Math.abs(stamped - before) < 5000, "cook cancel stamps cancelled_at (the hold starts)", String(o.cancelled_at));
  ok(o.refund_claimed_at === null && o.refunded_at === null, "…and leaves the money markers empty");

  // Forging attempts from the cook's session.
  const f1 = await as("authenticated", "update orders set cancelled_at = now() - interval '2 days' where id = $1 returning id", [id]);
  ok(/only order status may be changed/.test(f1.error ?? ""), "cook cannot backdate cancelled_at", f1.error ?? "NOT REJECTED");
  const f2 = await as("authenticated", "update orders set refund_claimed_at = now() where id = $1 returning id", [id]);
  ok(/only order status may be changed/.test(f2.error ?? ""), "cook cannot set refund_claimed_at", f2.error ?? "NOT REJECTED");
  const f3 = await as("authenticated", "update orders set refunded_at = now() where id = $1 returning id", [id]);
  ok(/only order status may be changed/.test(f3.error ?? ""), "cook cannot set refunded_at", f3.error ?? "NOT REJECTED");
  const f6 = await as("authenticated", "update orders set refund_failed_at = now() where id = $1 returning id", [id]);
  ok(/only order status may be changed/.test(f6.error ?? ""), "cook cannot set refund_failed_at (to stall their own refund)", f6.error ?? "NOT REJECTED");
  const f4 = await as("authenticated", "update orders set status = 'confirmed' where id = $1 returning id", [id]);
  ok(/illegal order status transition/.test(f4.error ?? ""), "cook cannot un-cancel directly (only the server's undo can)", f4.error ?? "NOT REJECTED");
  const f5 = await as("anon", "update orders set cancelled_at = null where id = $1 returning id", [id]);
  ok(/only order status may be changed/.test(f5.error ?? ""), "an anonymous session cannot clear cancelled_at", f5.error ?? "NOT REJECTED");
  const again = await row(id);
  ok(String(again.cancelled_at) === String(o.cancelled_at), "none of those attempts moved the cancel time");
}
{
  // Forging the timestamp IN THE SAME statement as a legal cancel.
  const id = await newOrder("confirmed");
  const r = await as("authenticated", "update orders set status = 'cancelled', cancelled_at = now() - interval '3 days' where id = $1 returning id", [id]);
  ok(/only order status may be changed/.test(r.error ?? ""), "cook cannot cancel AND backdate in one statement", r.error ?? "NOT REJECTED");
  ok((await row(id)).status === "confirmed", "…and that order is left untouched");
}
{
  // Other cook transitions never start a hold.
  const id = await newOrder("confirmed");
  for (const s of ["in_progress", "ready", "completed"]) {
    const r = await as("authenticated", `update orders set status = '${s}' where id = $1 returning id`, [id]);
    if (r.error) ok(false, `cook transition to ${s}`, r.error);
  }
  const o = await row(id);
  ok(o.status === "completed" && o.cancelled_at === null, "moving an order to in progress / ready / completed never stamps cancelled_at");
}

// ---- The server (role 'service_role'): claim, refund markers, undo. These
// are the same compare-and-set writes lib/refunds.ts sends.
const STALE = "now() - interval '10 minutes'";
const claimFresh = (id) =>
  as("service_role", "update orders set refund_claimed_at = now() where id = $1 and refunded_at is null and status = 'cancelled' and refund_claimed_at is null returning id", [id]);
const claimTakeOver = (id) =>
  as("service_role", `update orders set refund_claimed_at = now() where id = $1 and refunded_at is null and status = 'cancelled' and refund_claimed_at < ${STALE} returning id`, [id]);
const undo = (id) =>
  as("service_role", "update orders set status = 'confirmed' where id = $1 and status = 'cancelled' and refunded_at is null and refund_claimed_at is null returning id", [id]);
{
  const id = await newOrder("confirmed");
  await as("authenticated", "update orders set status = 'cancelled' where id = $1", [id]);
  ok((await claimFresh(id)).rows?.length === 1, "first refund attempt takes the claim");
  ok((await claimFresh(id)).rows?.length === 0 && (await claimTakeOver(id)).rows?.length === 0, "a second attempt cannot claim while the first is fresh");
  ok((await undo(id)).rows?.length === 0, "UNDO is refused while a refund holds the claim");
  ok((await row(id)).status === "cancelled", "…the order stays cancelled");
  // The first attempt died: its claim is now 11 minutes old.
  await q("update orders set refund_claimed_at = now() - interval '11 minutes' where id = $1", [id]);
  ok((await undo(id)).rows?.length === 0, "UNDO stays refused after a refund attempt went stale (outcome unknown)");
  ok((await claimTakeOver(id)).rows?.length === 1, "a later refund attempt can take over a stale claim");
  // Stripe said yes: stamp, then nothing can claim or undo again.
  await as("service_role", "update orders set refunded_at = now() where id = $1", [id]);
  ok(
    (await claimFresh(id)).rows?.length === 0 && (await claimTakeOver(id)).rows?.length === 0 && (await undo(id)).rows?.length === 0,
    "once refunded: no second refund claim and no undo"
  );
}
{
  // Stripe said no: the claim is released and undo works again.
  const id = await newOrder("confirmed");
  await as("authenticated", "update orders set status = 'cancelled' where id = $1", [id]);
  await claimFresh(id);
  await as("service_role", "update orders set refund_claimed_at = null where id = $1 and refunded_at is null", [id]);
  const u = await undo(id);
  const o = await row(id);
  ok(u.rows?.length === 1 && o.status === "confirmed", "after a clean Stripe failure the claim is released and UNDO works");
  ok(o.cancelled_at === null, "putting an order back clears cancelled_at (no stale hold)");
  // A failure recorded before the undo must not slow the NEXT hold's refund.
  const id2 = await newOrder("confirmed");
  await as("authenticated", "update orders set status = 'cancelled' where id = $1", [id2]);
  await as("service_role", "update orders set refund_failed_at = now() where id = $1", [id2]);
  await undo(id2);
  ok((await row(id2)).refund_failed_at === null, "putting an order back also clears the last failure time");
  // Cancelled again later: a brand new hold.
  await as("authenticated", "update orders set status = 'cancelled' where id = $1", [id]);
  ok((await row(id)).cancelled_at !== null, "cancelling it again starts a fresh hold");
}
{
  // Admin refund of an active order: refund first, then the status flips.
  const id = await newOrder("in_progress");
  await as("service_role", "update orders set refund_claimed_at = now() where id = $1 and refunded_at is null and refund_claimed_at is null", [id]);
  await as("service_role", "update orders set refunded_at = now() where id = $1", [id]);
  const r = await as("service_role", "update orders set status = 'cancelled' where id = $1 and status in ('confirmed','in_progress','ready') returning id", [id]);
  const o = await row(id);
  ok(r.rows?.length === 1 && o.cancelled_at !== null && o.refunded_at !== null, "admin refund of an active order: cancelled, stamped, already refunded");
}

// ---- The sweep's claim re-checks "the hold is STILL over" in the same write.
{
  const claimIfHoldOver = (id) =>
    as("service_role", "update orders set refund_claimed_at = now() where id = $1 and refunded_at is null and status = 'cancelled' and refund_claimed_at is null and cancelled_at <= now() - interval '24 hours' returning id", [id]);
  const id = await newOrder("confirmed");
  await as("authenticated", "update orders set status = 'cancelled' where id = $1", [id]);
  await q("update orders set cancelled_at = now() - interval '25 hours' where id = $1", [id]);
  // The sweep saw it as due… then the cook put it back and cancelled again.
  await undo(id);
  await as("authenticated", "update orders set status = 'cancelled' where id = $1", [id]);
  ok((await claimIfHoldOver(id)).rows?.length === 0, "an order put back and re-cancelled cannot be claimed as 'hold over'");
  await q("update orders set cancelled_at = null where id = $1", [id]);
  ok((await claimIfHoldOver(id)).rows?.length === 0, "an order with no cancel time cannot be claimed as 'hold over'");
  await q("update orders set cancelled_at = now() - interval '24 hours 1 second' where id = $1", [id]);
  ok((await claimIfHoldOver(id)).rows?.length === 1, "an order whose hold really is over can");
}

// ---- What the sweep would pick up (same filters as the route).
{
  await db.exec("delete from orders");
  const made = [];
  const mk = async (label, sql) => {
    const id = await newOrder("confirmed");
    await as("authenticated", "update orders set status = 'cancelled' where id = $1", [id]);
    if (sql) await q(sql, [id]);
    made.push([label, id]);
    return id;
  };
  await mk("fresh hold (1h old)", "update orders set cancelled_at = now() - interval '1 hour' where id = $1");
  await mk("hold over (25h old)", "update orders set cancelled_at = now() - interval '25 hours' where id = $1");
  await mk("hold over but already refunded", "update orders set cancelled_at = now() - interval '25 hours', refunded_at = now() where id = $1");
  await mk("hold over but never paid", "update orders set cancelled_at = now() - interval '25 hours', stripe_payment_intent_id = null where id = $1");
  await mk("cancelled before the migration (no cancel time)", "update orders set cancelled_at = null where id = $1");
  await mk("refund started 3 minutes ago", "update orders set cancelled_at = now() - interval '2 hours', refund_claimed_at = now() - interval '3 minutes' where id = $1");
  await mk("refund started 30 minutes ago and never finished", "update orders set cancelled_at = now() - interval '2 hours', refund_claimed_at = now() - interval '30 minutes' where id = $1");
  const put = await mk("cancelled 25h ago, then put back", "update orders set cancelled_at = now() - interval '25 hours' where id = $1");
  await undo(put);
  const name = Object.fromEntries(made.map(([l, id]) => [id, l]));

  // An admin's refund of a still-active order that never finished.
  const activeStuck = await newOrder("ready");
  await q("update orders set refund_claimed_at = now() - interval '40 minutes' where id = $1", [activeStuck]);
  made.push(["ACTIVE order with a refund that never finished", activeStuck]);
  name[activeStuck] = "ACTIVE order with a refund that never finished";

  const base = "from orders where refunded_at is null and stripe_payment_intent_id is not null";
  const held = await as("service_role", `select id ${base} and status = 'cancelled' and cancelled_at <= now() - interval '24 hours' order by cancelled_at asc limit 50`);
  const started = await as("service_role", `select id ${base} and refund_claimed_at is not null limit 50`);
  const heldNames = held.rows.map((r) => name[r.id]).sort();
  const startedNames = started.rows.map((r) => name[r.id]).sort();
  ok(JSON.stringify(heldNames) === JSON.stringify(["hold over (25h old)"]), "sweep query 1 finds exactly the order whose hold is over", JSON.stringify(heldNames));
  ok(
    JSON.stringify(startedNames) === JSON.stringify(["ACTIVE order with a refund that never finished", "refund started 3 minutes ago", "refund started 30 minutes ago and never finished"].sort()),
    "sweep query 2 finds every started refund, on any order (the app then skips the fresh one)",
    JSON.stringify(startedNames)
  );
}

console.log(out.join("\n"));
console.log(`\n${out.length - failed} passed, ${failed} failed`);
await db.close();
process.exit(failed ? 1 : 0);
