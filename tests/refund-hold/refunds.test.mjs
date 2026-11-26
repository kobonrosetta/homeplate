// Behavior test of the REAL lib/refunds.ts and the REAL sweep route, running
// against an in-process Postgres (PGlite) that carries the production order
// guard and migration 45 verbatim. Only three things are stand-ins (mocks/):
// the service-role Supabase client (a small query builder over that
// Postgres), Stripe (each test scripts its answer) and email (recorded).
// Nothing touches Supabase, Stripe or Resend.
// How to run: see README.md in this folder (it needs the --tsconfig flag).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  refundOrderNow,
  reinstateCancelledOrder,
  readRefundHold,
} from "@/lib/refunds";
import { POST as sweep } from "@/app/api/cron/refund-cancelled/route";

const read = (f) =>
  readFileSync(new URL(`../../supabase/${f}`, import.meta.url), "utf8");
const g = globalThis;
const out = [];
let failed = 0;
const ok = (c, label, d = "") => {
  if (!c) failed++;
  out.push(`${c ? "PASS" : "FAIL"}  ${label}${d ? "  — " + d : ""}`);
};

// ---------- a Supabase-shaped query builder over PGlite ----------
// It supports exactly the calls lib/refunds.ts, lib/orders.ts and the sweep
// route make; anything else throws, so a new kind of query can't pass
// silently untested.
function fakeClient(db) {
  const iso = (row) =>
    row &&
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])
    );
  class Q {
    constructor(table) {
      this.table = table;
      this.op = "select";
      this.cols = "*";
      this.returning = null;
      this.payload = null;
      this.where = [];
      this.params = [];
      this.single = false;
      this.tail = "";
    }
    p(v) {
      this.params.push(v);
      return `$${this.params.length}`;
    }
    select(cols = "*") {
      if (this.op === "select") this.cols = cols;
      else this.returning = cols;
      return this;
    }
    update(obj) {
      this.op = "update";
      this.payload = obj;
      return this;
    }
    eq(c, v) {
      this.where.push(`${c} = ${this.p(v)}`);
      return this;
    }
    lt(c, v) {
      this.where.push(`${c} < ${this.p(v)}`);
      return this;
    }
    lte(c, v) {
      this.where.push(`${c} <= ${this.p(v)}`);
      return this;
    }
    is(c, v) {
      if (v !== null) throw new Error("fake client: is() only supports null");
      this.where.push(`${c} is null`);
      return this;
    }
    not(c, op, v) {
      if (op !== "is" || v !== null) throw new Error("fake client: only not(col, 'is', null)");
      this.where.push(`${c} is not null`);
      return this;
    }
    in(c, vs) {
      this.where.push(`${c}::text = any(${this.p(vs)}::text[])`);
      return this;
    }
    order(c, o = {}) {
      this.tail += ` order by ${c} ${o.ascending === false ? "desc" : "asc"}`;
      return this;
    }
    limit(n) {
      this.tail += ` limit ${Number(n)}`;
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    async run() {
      let sql;
      if (this.op === "update") {
        const sets = Object.entries(this.payload).map(
          ([k, v]) => `${k} = ${v === null ? "null" : this.p(v)}`
        );
        sql = `update ${this.table} set ${sets.join(", ")}`;
      } else sql = `select ${this.cols} from ${this.table}`;
      if (this.where.length) sql += ` where ${this.where.join(" and ")}`;
      if (this.op === "update" && this.returning) sql += ` returning ${this.returning}`;
      if (this.op === "select") sql += this.tail;
      try {
        const r = await db.query(sql, this.params);
        const rows = r.rows.map(iso);
        if (this.op === "update" && !this.returning) return { data: null, error: null };
        return { data: this.single ? rows[0] ?? null : rows, error: null };
      } catch (e) {
        return { data: null, error: { code: e.code, message: e.message } };
      }
    }
    then(res, rej) {
      return this.run().then(res, rej);
    }
  }
  return { from: (t) => new Q(t) };
}

async function makeWorld(migrated) {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create type order_status as enum ('pending','confirmed','in_progress','ready','completed','cancelled');
    create table cooks (id uuid primary key default gen_random_uuid(), business_name text);
    create table listings (id uuid primary key default gen_random_uuid(), cook_id uuid, limited_quantity boolean default false, quantity_available integer default 0);
    create table orders (
      id uuid primary key default gen_random_uuid(),
      buyer_id uuid, cook_id uuid,
      status order_status not null default 'pending',
      fulfillment text default 'pickup', subtotal_cents integer, service_fee_cents integer, total_cents integer,
      stripe_payment_intent_id text, pickup_time text, notes text,
      contact_name text, contact_phone text, contact_email text, delivery_address text,
      ready_by_date date, event_date date, custom_request_id uuid,
      reminder_sent_at timestamptz, refunded_at timestamptz,
      created_at timestamptz not null default now()
    );
    create table order_items (id uuid primary key default gen_random_uuid(), order_id uuid, listing_id uuid, quantity integer);
    grant all on orders, cooks, listings, order_items to authenticated, anon, service_role;
  `);
  const inProgress = read("add-order-in-progress.sql");
  await db.exec(
    inProgress.slice(inProgress.indexOf("create or replace function public.enforce_order_update_rules()"))
  );
  const harden = read("harden-orders.sql");
  const a = harden.indexOf("drop trigger if exists orders_guard_update on orders;");
  await db.exec(harden.slice(a, harden.indexOf(";", harden.indexOf("create trigger orders_guard_update")) + 1));
  if (migrated) await db.exec(read("add-order-refund-hold.sql"));

  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const kitchen = (await one("insert into cooks (business_name) values ('40 Acres Test Kitchen') returning id")).id;
  const other = (await one("insert into cooks (business_name) values ('Someone Else') returning id")).id;
  // Plenty of stock: the real code clamps the shelf at zero, which would
  // muddy the arithmetic these checks do.
  const listing = (
    await one("insert into listings (cook_id, limited_quantity, quantity_available) values ($1, true, 1000) returning id", [kitchen])
  ).id;
  // A paid order for 2 of the limited dish; stock already taken at payment.
  const paidOrder = async (status = "confirmed") => {
    const id = (
      await one(
        `insert into orders (cook_id, status, subtotal_cents, service_fee_cents, total_cents, stripe_payment_intent_id, contact_name, contact_email)
         values ($1, $2, 3600, 318, 3918, 'pi_' || substr(gen_random_uuid()::text, 1, 8), 'Theresa', 'buyer@example.com') returning id`,
        [kitchen, status]
      )
    ).id;
    await db.query("insert into order_items (order_id, listing_id, quantity) values ($1, $2, 2)", [id, listing]);
    await db.query("update listings set quantity_available = quantity_available - 2 where id = $1", [listing]);
    return id;
  };
  // What the cook's Cancel button does: a status change from THEIR session
  // (so the production guard runs), then the action restocks.
  const cookCancels = async (id) => {
    await db.exec("set role authenticated");
    try {
      await db.query("update orders set status = 'cancelled' where id = $1", [id]);
    } finally {
      await db.exec("reset role");
    }
    await db.query("update listings set quantity_available = quantity_available + 2 where id = $1", [listing]);
  };
  const order = (id) => one("select * from orders where id = $1", [id]);
  const stock = async () => (await one("select quantity_available as q from listings where id = $1", [listing])).q;
  return { db, kitchen, other, paidOrder, cookCancels, order, stock };
}

function install(db) {
  g.__fakeDb = fakeClient(db);
  g.__emails = [];
  g.__stripeCalls = [];
  g.__stripe = async () => ({ id: "re_ok" });
}
const emailsTo = (to) => g.__emails.filter((e) => e.to === to).map((e) => e.subject);
const callSweep = async (auth) => {
  const res = await sweep(
    new Request("http://test/api/cron/refund-cancelled", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    })
  );
  return { status: res.status, body: await res.json() };
};
process.env.CRON_SECRET = "test-secret";

// =================== WITH migration 45 ===================
{
  const w = await makeWorld(true);
  install(w.db);

  // -- 1. Cook's "Refund now", happy path.
  {
    const id = await w.paidOrder();
    await w.cookCancels(id);
    const stockBefore = await w.stock();
    const hold = await readRefundHold(id);
    ok(hold.active && typeof hold.cancelledAt === "string", "after a cook cancel the hold is active (cancel time stamped)", String(hold.cancelledAt));
    const r = await refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
    const o = await w.order(id);
    ok(r.ok && o.refunded_at && o.status === "cancelled", "Refund now: order refunded and still cancelled", JSON.stringify(r));
    ok(
      g.__stripeCalls.length === 1 && g.__stripeCalls[0].paymentIntentId === o.stripe_payment_intent_id && g.__stripeCalls[0].idempotencyKey === id,
      "…Stripe asked exactly once, for this order's payment, keyed by the order id"
    );
    ok(JSON.stringify(emailsTo("buyer@example.com")) === JSON.stringify(["Refunded: your ForkFork order"]), "…buyer emailed that they were refunded", JSON.stringify(emailsTo("buyer@example.com")));
    ok((await w.stock()) === stockBefore, "…stock is not put back a second time");
    ok(r.ok && r.order.totalCents === 3918 && r.order.buyerName === "Theresa", "…the result carries what the admin note needs");

    // -- 2. Again: nothing more moves.
    const again = await refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
    ok(!again.ok && again.reason === "already_refunded" && g.__stripeCalls.length === 1, "a second Refund now is refused and Stripe is not asked again");
    const undo = await reinstateCancelledOrder(id, { cookId: w.kitchen });
    ok(!undo.ok && undo.reason === "already_refunded" && (await w.order(id)).status === "cancelled", "a refunded order cannot be put back");
  }

  // -- 3. Wrong kitchen / wrong state / unpaid never reach Stripe.
  {
    install(w.db);
    const id = await w.paidOrder();
    await w.cookCancels(id);
    const r1 = await refundOrderNow(id, { cookId: w.other, cancelledOnly: true });
    const r2 = await reinstateCancelledOrder(id, { cookId: w.other });
    ok(!r1.ok && r1.reason === "not_yours" && !r2.ok && r2.reason === "not_yours", "another kitchen can neither refund nor put back this order");
    const active = await w.paidOrder("in_progress");
    const r3 = await refundOrderNow(active, { cookId: w.kitchen, cancelledOnly: true });
    ok(!r3.ok && r3.reason === "not_cancelled", "a cook cannot refund an order that isn't cancelled");
    const done = await w.paidOrder("completed");
    const r4 = await refundOrderNow(done, { cookId: w.kitchen, cancelledOnly: true });
    ok(!r4.ok && r4.reason === "not_cancelled", "a cook cannot refund a completed order");
    const r5 = await reinstateCancelledOrder(active, { cookId: w.kitchen });
    ok(!r5.ok && r5.reason === "not_cancelled", "an active order cannot be 'put back'");
    const r6 = await refundOrderNow("00000000-0000-0000-0000-000000000000", { cookId: w.kitchen, cancelledOnly: true });
    ok(!r6.ok && r6.reason === "not_found", "an unknown order id is refused");
    await w.db.query("update orders set stripe_payment_intent_id = null where id = $1", [id]);
    const r7 = await refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
    ok(!r7.ok && r7.reason === "never_paid", "an unpaid order is refused");
    ok(g.__stripeCalls.length === 0 && g.__emails.length === 0, "none of those refusals reached Stripe or sent an email");
  }

  // -- 4. Undo, happy path.
  {
    install(w.db);
    const id = await w.paidOrder();
    await w.cookCancels(id);
    const stockAfterCancel = await w.stock();
    const r = await reinstateCancelledOrder(id, { cookId: w.kitchen });
    const o = await w.order(id);
    ok(r.ok && o.status === "confirmed" && o.cancelled_at === null && o.refunded_at === null, "Undo cancel: order is active again, hold cleared, nothing refunded");
    ok((await w.stock()) === stockAfterCancel - 2, "…the limited stock is taken again");
    ok(
      JSON.stringify(emailsTo("buyer@example.com")) === JSON.stringify(["Your order is back on: 40 Acres Test Kitchen"]) && g.__stripeCalls.length === 0,
      "…buyer told it's back on; Stripe untouched"
    );
    const second = await reinstateCancelledOrder(id, { cookId: w.kitchen });
    ok(!second.ok && (await w.stock()) === stockAfterCancel - 2, "a second Undo does nothing (stock not taken twice)");
    const refund = await refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
    ok(!refund.ok && refund.reason === "not_cancelled", "after Undo the cook's refund button no longer applies");
  }

  // -- 5. Stripe clearly says no: nothing changed, undo still possible.
  {
    install(w.db);
    g.__stripe = async () => ({ error: "Your card was declined.", code: "card_declined" });
    const id = await w.paidOrder();
    await w.cookCancels(id);
    const r = await refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
    const o = await w.order(id);
    ok(!r.ok && r.reason === "stripe" && o.refunded_at === null && o.refund_claimed_at === null, "Stripe says no: not refunded, claim released", JSON.stringify(r));
    ok(g.__emails.length === 0, "…no 'refunded' email goes out");
    const undo = await reinstateCancelledOrder(id, { cookId: w.kitchen });
    ok(undo.ok, "…and the order can still be put back");
  }

  // -- 6. Stripe doesn't answer: claim kept, undo refused, retry settles it.
  {
    install(w.db);
    g.__stripe = async () => ({ error: "Couldn't reach Stripe. Try again.", uncertain: true });
    const id = await w.paidOrder();
    await w.cookCancels(id);
    const r = await refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
    let o = await w.order(id);
    ok(!r.ok && r.reason === "uncertain" && o.refunded_at === null && o.refund_claimed_at !== null, "Stripe silent: not marked refunded, claim KEPT");
    ok(!r.ok && r.error.includes("retried automatically"), "…and a cancelled order is honestly promised an automatic retry");
    const undo = await reinstateCancelledOrder(id, { cookId: w.kitchen });
    ok(!undo.ok && (await w.order(id)).status === "cancelled", "…the order can NOT be put back (the refund may have gone through)");
    const tooSoon = await refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
    ok(!tooSoon.ok && tooSoon.reason === "busy" && g.__stripeCalls.length === 1, "…an immediate retry waits (claim is fresh), Stripe not asked twice");
    await w.db.query("update orders set refund_claimed_at = now() - interval '11 minutes' where id = $1", [id]);
    g.__stripe = async () => ({ id: "re_replayed" });
    const later = await refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
    o = await w.order(id);
    ok(
      later.ok && o.refunded_at !== null && g.__stripeCalls.length === 2 && g.__stripeCalls[1].idempotencyKey === id,
      "…a retry after ten minutes takes over with the SAME key and records the refund"
    );
    // The same silence on an order the sweep doesn't watch must not promise one.
    install(w.db);
    g.__stripe = async () => ({ error: "Couldn't reach Stripe. Try again.", uncertain: true });
    const active = await w.paidOrder("ready");
    const a = await refundOrderNow(active, { cookId: w.kitchen });
    ok(!a.ok && a.reason === "uncertain" && a.error.includes("Press Refund again") && !a.error.includes("automatically"), "Stripe silent on an ACTIVE order (admin): told to press Refund again, no false promise");
  }

  // -- 7. Stripe: "already refunded" is recorded as done.
  {
    install(w.db);
    g.__stripe = async () => ({ error: "Charge has already been refunded.", code: "charge_already_refunded" });
    const id = await w.paidOrder();
    await w.cookCancels(id);
    const r = await refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
    ok(r.ok && (await w.order(id)).refunded_at !== null, "Stripe says 'already refunded': the order is marked refunded");
  }

  // -- 8. THE RACE: an Undo arriving while Stripe is working must lose.
  {
    install(w.db);
    const id = await w.paidOrder();
    await w.cookCancels(id);
    let undoDuringStripe;
    g.__stripe = async () => {
      undoDuringStripe = await reinstateCancelledOrder(id, { cookId: w.kitchen });
      return { id: "re_ok" };
    };
    const r = await refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
    const o = await w.order(id);
    ok(
      r.ok && !undoDuringStripe.ok && o.status === "cancelled" && o.refunded_at !== null,
      "Undo pressed WHILE the refund is at Stripe: undo is refused, order ends refunded + cancelled",
      JSON.stringify(undoDuringStripe)
    );
    ok(!emailsTo("buyer@example.com").some((s) => s.startsWith("Your order is back on")), "…the buyer is never told 'back on'");
  }
  // -- 9. …fired together, both arrival orders, 40 rounds: exactly one wins.
  {
    let bad = 0;
    let undoWins = 0;
    for (let i = 0; i < 40; i++) {
      install(w.db);
      const id = await w.paidOrder();
      await w.cookCancels(id);
      const undo = () => reinstateCancelledOrder(id, { cookId: w.kitchen });
      const refund = () => refundOrderNow(id, { cookId: w.kitchen, cancelledOnly: true });
      const [first, second] = i % 2 ? [undo, refund] : [refund, undo];
      const results = await Promise.all([first(), second()]);
      const o = await w.order(id);
      const refunded = o.refunded_at !== null;
      const active = o.status !== "cancelled";
      if (refunded === active) bad++; // both won, or neither did
      if (results.filter((r) => r.ok).length !== 1) bad++;
      if (active && g.__stripeCalls.length) bad++; // back on, yet Stripe was asked
      if (active) undoWins++;
    }
    ok(bad === 0, "40 simultaneous Undo/Refund pairs: exactly one wins every time", `undo won ${undoWins}, refund won ${40 - undoWins}`);
  }

  // -- 10. Admin refund (no cancelledOnly) of an ACTIVE and of a COMPLETED order.
  {
    install(w.db);
    const id = await w.paidOrder("in_progress");
    const before = await w.stock();
    const r = await refundOrderNow(id, { cookId: w.kitchen });
    const o = await w.order(id);
    ok(r.ok && o.refunded_at !== null && o.status === "cancelled" && o.cancelled_at !== null, "admin refund of an active order: refunded, then cancelled");
    ok((await w.stock()) === before + 2, "…and its limited stock goes back on the shelf once");
    const done = await w.paidOrder("completed");
    const r2 = await refundOrderNow(done, { cookId: w.kitchen });
    const o2 = await w.order(done);
    ok(r2.ok && o2.refunded_at !== null && o2.status === "completed", "admin refund of a completed order keeps it 'completed' (history intact)");
  }

  // -- 11. The sweep.
  {
    install(w.db);
    await w.db.exec("delete from orders");
    ok((await callSweep()).status === 401 && (await callSweep("Bearer wrong")).status === 401, "sweep refuses a missing or wrong password");

    const mk = async (label, sql) => {
      const id = await w.paidOrder();
      await w.cookCancels(id);
      if (sql) await w.db.query(sql, [id]);
      return [label, id];
    };
    const fresh = await mk("fresh", "update orders set cancelled_at = now() - interval '1 hour' where id = $1");
    const almost = await mk("almost", "update orders set cancelled_at = now() - interval '23 hours 59 minutes' where id = $1");
    const due1 = await mk("due1", "update orders set cancelled_at = now() - interval '24 hours 1 minute' where id = $1");
    const due2 = await mk("due2", "update orders set cancelled_at = now() - interval '3 days' where id = $1");
    const legacy = await mk("legacy", "update orders set cancelled_at = null where id = $1");
    const sending = await mk("sending", "update orders set cancelled_at = now() - interval '30 hours', refund_claimed_at = now() - interval '2 minutes' where id = $1");
    const stalled = await mk("stalled", "update orders set cancelled_at = now() - interval '2 hours', refund_claimed_at = now() - interval '25 minutes' where id = $1");
    const putBack = await mk("putBack", "update orders set cancelled_at = now() - interval '2 days' where id = $1");
    await reinstateCancelledOrder(putBack[1], { cookId: w.kitchen });
    const activeOld = await w.paidOrder("ready");
    install(w.db);

    const r = await callSweep("Bearer test-secret");
    const refundedIds = new Set(g.__stripeCalls.map((c) => c.idempotencyKey));
    const want = [due1[1], due2[1], stalled[1]];
    ok(r.status === 200 && r.body.refunded === 3 && r.body.failed === 0 && r.body.due === 3, "sweep reports 3 due, 3 refunded", JSON.stringify(r.body));
    ok(want.every((id) => refundedIds.has(id)) && refundedIds.size === 3, "sweep refunded exactly: the two holds that ran out + the stuck refund");
    for (const [label, id] of [fresh, almost, legacy, sending]) {
      const o = await w.order(id);
      ok(o.refunded_at === null && o.status === "cancelled", `sweep left "${label}" alone`);
    }
    ok((await w.order(putBack[1])).status === "confirmed" && (await w.order(activeOld)).refunded_at === null, "sweep never touches an order that was put back, or an active one");
    const adminNotes = emailsTo("admins");
    ok(adminNotes.length === 1 && adminNotes[0] === "Refunded automatically: 3 cancelled orders", "sweep leaves the admins one summary note", JSON.stringify(adminNotes));
    ok(emailsTo("buyer@example.com").filter((s) => s === "Refunded: your ForkFork order").length === 3, "…and each refunded buyer is emailed");

    install(w.db);
    const again = await callSweep("Bearer test-secret");
    ok(again.body.refunded === 0 && again.body.due === 0 && g.__stripeCalls.length === 0 && g.__emails.length === 0, "running the sweep again right away does nothing", JSON.stringify(again.body));

    // A failing refund is reported, retried next run, and never marked done.
    install(w.db);
    const bad = await mk("bad", "update orders set cancelled_at = now() - interval '26 hours' where id = $1");
    g.__stripe = async () => ({ error: "Insufficient funds in your Stripe balance.", code: "balance_insufficient" });
    const f = await callSweep("Bearer test-secret");
    const o = await w.order(bad[1]);
    ok(
      f.status === 200 && f.body.failed === 1 && f.body.refunded === 0 && o.refunded_at === null && o.refund_claimed_at === null,
      "a refund Stripe rejects: reported as failed, not marked refunded, free to retry",
      JSON.stringify(f.body)
    );
    ok(
      emailsTo("admins")[0] === "Refund FAILED for 1 cancelled order" && g.__emails.find((e) => e.to === "admins").html.includes("Insufficient funds"),
      "…admins get the failure and Stripe's reason"
    );
    g.__stripe = async () => ({ id: "re_ok" });
    const retry = await callSweep("Bearer test-secret");
    ok(retry.body.refunded === 1 && (await w.order(bad[1])).refunded_at !== null, "…the next run retries and succeeds");

    // More due than one run may move.
    install(w.db);
    for (let i = 0; i < 12; i++) await mk("bulk" + i, "update orders set cancelled_at = now() - interval '30 hours' where id = $1");
    const big = await callSweep("Bearer test-secret");
    ok(big.body.due === 12 && big.body.refunded === 10 && big.body.more === true, "one run refunds at most 10 and says there are more", JSON.stringify(big.body));
    const rest = await callSweep("Bearer test-secret");
    ok(rest.body.refunded === 2 && rest.body.more === false, "…the next run finishes the rest", JSON.stringify(rest.body));
  }
  await w.db.close();
}

// =================== WITHOUT migration 45 (code deployed first) ===================
{
  const w = await makeWorld(false);
  install(w.db);
  const id = await w.paidOrder();
  await w.cookCancels(id);
  const hold = await readRefundHold(id);
  ok(hold.active === false && hold.cancelledAt === null, "no migration: the hold reads as OFF (emails keep the old wording)");
  const r = await refundOrderNow(id, { cookId: w.kitchen });
  ok(r.ok && (await w.order(id)).refunded_at !== null && g.__stripeCalls.length === 1, "no migration: the admin Refund button still works", JSON.stringify(r));

  install(w.db);
  const id2 = await w.paidOrder();
  await w.cookCancels(id2);
  const u = await reinstateCancelledOrder(id2, { cookId: w.kitchen });
  ok(u.ok && (await w.order(id2)).status === "confirmed", "no migration: the admin Reinstate button still works", JSON.stringify(u));

  install(w.db);
  const id3 = await w.paidOrder();
  await w.cookCancels(id3);
  g.__stripe = async () => ({ error: "Your card was declined.", code: "card_declined" });
  const f = await refundOrderNow(id3, { cookId: w.kitchen });
  ok(!f.ok && f.reason === "stripe" && (await w.order(id3)).refunded_at === null, "no migration: a Stripe failure is still reported cleanly");

  install(w.db);
  const s = await callSweep("Bearer test-secret");
  ok(s.status === 200 && typeof s.body.skipped === "string" && g.__stripeCalls.length === 0, "no migration: the sweep reports 'not set up' and refunds nothing", JSON.stringify(s.body));
  await w.db.close();
}

console.log(out.join("\n"));
console.log(`\n${out.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
