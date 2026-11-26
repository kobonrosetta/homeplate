// Behavior test of the REAL lib/refunds.ts and the REAL sweep route, running
// against an in-process Postgres (see fake-db.mjs) that carries the
// production order guard and migration 45 verbatim. Only three things are
// stand-ins (mocks/): the service-role Supabase client, Stripe (each test
// scripts its answer) and email (recorded). Nothing touches Supabase, Stripe
// or Resend.
// How to run: see README.md in this folder (it needs the --tsconfig flag).
import {
  refundOrderNow,
  reinstateCancelledOrder,
  readRefundHold,
} from "@/lib/refunds";
import { POST as sweep } from "@/app/api/cron/refund-cancelled/route";
import { makeWorld, install, emailsTo, reporter } from "./fake-db.mjs";

const g = globalThis;
const { ok, finish } = reporter();
const callSweep = async (auth = "Bearer test-secret") => {
  const res = await sweep(
    new Request("http://test/api/cron/refund-cancelled", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    })
  );
  return { status: res.status, body: await res.json() };
};
process.env.CRON_SECRET = "test-secret";
const YES = async () => ({ id: "re_ok" });
const NO = async () => ({ error: "Your card was declined.", code: "card_declined", uncertain: false });
const SILENT = async () => ({ error: "Couldn't reach Stripe. Try again.", uncertain: true });
// A database that answers, but not with "that column is missing".
const OUTAGE = { code: "PGRST002", message: "Could not query the database for the schema cache. Retrying." };

// =================== WITH migration 45 ===================
{
  const w = await makeWorld(true);
  install(w.db);
  const cook = { cookId: w.kitchen, cancelledOnly: true, heldOnly: true }; // the cook's button
  const cookUndo = { cookId: w.kitchen, heldOnly: true };
  const cancelled = async () => {
    const id = await w.paidOrder();
    await w.cookCancels(id);
    return id;
  };

  // -- 1. Cook's "Refund now", happy path.
  {
    const id = await cancelled();
    const stockBefore = await w.stock();
    const hold = await readRefundHold(id);
    ok(hold.active && typeof hold.cancelledAt === "string" && hold.claimed === false, "after a cook cancel the hold is active (cancel time stamped, no refund started)", String(hold.cancelledAt));
    const r = await refundOrderNow(id, cook);
    const o = await w.order(id);
    ok(r.ok && o.refunded_at && o.status === "cancelled", "Refund now: order refunded and still cancelled", JSON.stringify(r));
    ok(
      g.__stripeCalls.length === 1 && g.__stripeCalls[0].paymentIntentId === o.stripe_payment_intent_id && g.__stripeCalls[0].idempotencyKey === id,
      "…Stripe asked exactly once, for this order's payment, keyed by the order id"
    );
    ok(JSON.stringify(emailsTo("buyer@example.com")) === JSON.stringify(["Refunded: your ForkFork order"]), "…buyer emailed that they were refunded", JSON.stringify(emailsTo("buyer@example.com")));
    ok((await w.stock()) === stockBefore, "…stock is not put back a second time");
    ok(r.ok && r.order.totalCents === 3918 && r.order.buyerName === "Theresa" && r.order.id === id, "…the result carries what the admin note needs");

    // -- 2. Again: nothing more moves.
    const again = await refundOrderNow(id, cook);
    ok(!again.ok && again.reason === "already_refunded" && g.__stripeCalls.length === 1, "a second Refund now is refused and Stripe is not asked again");
    const undo = await reinstateCancelledOrder(id, cookUndo);
    ok(!undo.ok && undo.reason === "already_refunded" && (await w.order(id)).status === "cancelled", "a refunded order cannot be put back");
  }

  // -- 3. Wrong kitchen / wrong state / unpaid / old rows never reach Stripe.
  {
    install(w.db);
    const id = await cancelled();
    const r1 = await refundOrderNow(id, { ...cook, cookId: w.other });
    const r2 = await reinstateCancelledOrder(id, { ...cookUndo, cookId: w.other });
    ok(!r1.ok && r1.reason === "not_yours" && !r2.ok && r2.reason === "not_yours", "another kitchen can neither refund nor put back this order");
    const active = await w.paidOrder("in_progress");
    const r3 = await refundOrderNow(active, cook);
    ok(!r3.ok && r3.reason === "not_cancelled", "a cook cannot refund an order that isn't cancelled");
    const done = await w.paidOrder("completed");
    const r4 = await refundOrderNow(done, cook);
    ok(!r4.ok && r4.reason === "not_cancelled", "a cook cannot refund a completed order");
    const r5 = await reinstateCancelledOrder(active, cookUndo);
    ok(!r5.ok && r5.reason === "not_cancelled", "an active order cannot be 'put back'");
    const r6 = await refundOrderNow("00000000-0000-0000-0000-000000000000", cook);
    const r6b = await refundOrderNow("not-even-a-uuid", cook);
    ok(!r6.ok && r6.reason === "not_found" && !r6b.ok && r6b.reason === "not_found", "an unknown or malformed order id is refused");
    // A cancel from before the hold existed (no stamped cancel time).
    const legacy = await cancelled();
    await w.db.query("update orders set cancelled_at = null where id = $1", [legacy]);
    const r8 = await refundOrderNow(legacy, cook);
    const r9 = await reinstateCancelledOrder(legacy, cookUndo);
    ok(!r8.ok && r8.reason === "not_held" && !r9.ok && r9.reason === "not_held" && (await w.order(legacy)).status === "cancelled", "a cook cannot refund or put back a cancel that predates the hold");
    await w.db.query("update orders set stripe_payment_intent_id = null where id = $1", [id]);
    const r7 = await refundOrderNow(id, cook);
    ok(!r7.ok && r7.reason === "never_paid", "an unpaid order is refused");
    ok(g.__stripeCalls.length === 0 && g.__emails.length === 0, "none of those refusals reached Stripe or sent an email");
    // …while the admin (no heldOnly) still can refund that old cancel.
    const admin = await refundOrderNow(legacy, { cookId: w.kitchen });
    ok(admin.ok && (await w.order(legacy)).refunded_at !== null, "the admin can still refund a cancel that predates the hold");
  }

  // -- 4. Undo, happy path.
  {
    install(w.db);
    const id = await cancelled();
    const stockAfterCancel = await w.stock();
    const r = await reinstateCancelledOrder(id, cookUndo);
    const o = await w.order(id);
    ok(r.ok && o.status === "confirmed" && o.cancelled_at === null && o.refunded_at === null, "Undo cancel: order is active again, hold cleared, nothing refunded");
    ok((await w.stock()) === stockAfterCancel - 2, "…the limited stock is taken again");
    ok(
      JSON.stringify(emailsTo("buyer@example.com")) === JSON.stringify(["Your order is back on: 40 Acres Test Kitchen"]) && g.__stripeCalls.length === 0,
      "…buyer told it's back on; Stripe untouched"
    );
    const second = await reinstateCancelledOrder(id, cookUndo);
    ok(!second.ok && (await w.stock()) === stockAfterCancel - 2, "a second Undo does nothing (stock not taken twice)");
    const refund = await refundOrderNow(id, cook);
    ok(!refund.ok && refund.reason === "not_cancelled", "after Undo the cook's refund button no longer applies");
  }

  // -- 5. Stripe clearly says no: nothing changed, undo still possible.
  {
    install(w.db);
    g.__stripe = NO;
    const id = await cancelled();
    const r = await refundOrderNow(id, cook);
    const o = await w.order(id);
    ok(!r.ok && r.reason === "stripe" && o.refunded_at === null && o.refund_claimed_at === null, "Stripe says no: not refunded, claim released", JSON.stringify(r));
    ok(o.refund_failed_at !== null && g.__stripeCalls.length === 1, "…the failure time is recorded, and a clear no is not asked twice");
    ok(g.__emails.length === 0, "…no 'refunded' email goes out");
    const undo = await reinstateCancelledOrder(id, cookUndo);
    ok(undo.ok && (await w.order(id)).refund_failed_at === null, "…and the order can still be put back (which clears the failure)");
  }

  // -- 6. Stripe doesn't answer: one quick second try, then claim kept.
  {
    install(w.db);
    g.__stripe = SILENT;
    const id = await cancelled();
    const r = await refundOrderNow(id, cook);
    let o = await w.order(id);
    ok(!r.ok && r.reason === "uncertain" && o.refunded_at === null && o.refund_claimed_at !== null, "Stripe silent: not marked refunded, claim KEPT");
    ok(g.__stripeCalls.length === 2 && g.__stripeCalls[1].idempotencyKey === id, "…it asked once more with the same key before giving up");
    ok(!r.ok && r.error.includes("retried automatically") && o.refund_failed_at !== null, "…a retry is promised (true: the claim is in place) and the failure recorded");
    const undo = await reinstateCancelledOrder(id, cookUndo);
    ok(!undo.ok && undo.reason === "changed" && (await w.order(id)).status === "cancelled", "…the order can NOT be put back (the refund may have gone through)");
    const tooSoon = await refundOrderNow(id, cook);
    ok(!tooSoon.ok && tooSoon.reason === "busy" && g.__stripeCalls.length === 2, "…an immediate retry waits (claim is fresh), Stripe not asked again");
    await w.db.query("update orders set refund_claimed_at = now() - interval '11 minutes' where id = $1", [id]);
    g.__stripe = YES;
    const later = await refundOrderNow(id, cook);
    o = await w.order(id);
    ok(
      later.ok && o.refunded_at !== null && g.__stripeCalls.length === 3 && g.__stripeCalls[2].idempotencyKey === id,
      "…a retry after ten minutes takes over with the SAME key and records the refund"
    );

    // A hiccup that clears on the second try is just a success.
    install(w.db);
    let n = 0;
    g.__stripe = async () => (++n === 1 ? SILENT() : YES());
    const id2 = await cancelled();
    const r2 = await refundOrderNow(id2, cook);
    ok(r2.ok && (await w.order(id2)).refunded_at !== null && (await w.order(id2)).refund_failed_at === null, "Stripe silent once, then fine: refunded, nothing recorded as failed");
  }

  // -- 7. Stripe: "already refunded" is recorded as done.
  {
    install(w.db);
    g.__stripe = async () => ({ error: "Charge has already been refunded.", code: "charge_already_refunded", uncertain: false });
    const id = await cancelled();
    const r = await refundOrderNow(id, cook);
    ok(r.ok && (await w.order(id)).refunded_at !== null, "Stripe says 'already refunded': the order is marked refunded");
  }

  // -- 8. The Stripe key is the row's own id, however the caller spells it.
  {
    install(w.db);
    const id = await cancelled();
    const r = await refundOrderNow(id.toUpperCase(), cook);
    ok(r.ok && g.__stripeCalls[0].idempotencyKey === id && id !== id.toUpperCase(), "an order id sent in capitals still uses the one true Stripe key");
  }

  // -- 9. THE RACE: an Undo arriving while Stripe is working must lose.
  {
    install(w.db);
    const id = await cancelled();
    let undoDuringStripe;
    g.__stripe = async () => {
      undoDuringStripe = await reinstateCancelledOrder(id, cookUndo);
      return { id: "re_ok" };
    };
    const r = await refundOrderNow(id, cook);
    const o = await w.order(id);
    ok(
      r.ok && !undoDuringStripe.ok && undoDuringStripe.reason === "changed" && o.status === "cancelled" && o.refunded_at !== null,
      "Undo pressed WHILE the refund is at Stripe: undo is refused, order ends refunded + cancelled",
      JSON.stringify(undoDuringStripe)
    );
    ok(!emailsTo("buyer@example.com").some((s) => s.startsWith("Your order is back on")), "…the buyer is never told 'back on'");
  }
  // -- 10. …fired together, shuffled 60 ways: exactly one wins, and the
  //        loser is told the truth. Covers the cook's buttons AND the admin's
  //        Refund (no cancelledOnly) against a cook's undo.
  {
    let bad = 0;
    let undoWins = 0;
    const reasons = new Set();
    for (let i = 0; i < 60; i++) {
      install(w.db);
      g.__jitter = true;
      const id = await cancelled();
      const undo = () => reinstateCancelledOrder(id, cookUndo);
      const refund = () => refundOrderNow(id, i % 3 === 0 ? { cookId: w.kitchen } : cook);
      const [first, second] = i % 2 ? [undo, refund] : [refund, undo];
      const results = await Promise.all([first(), second()]);
      g.__jitter = false;
      const o = await w.order(id);
      const refunded = o.refunded_at !== null;
      // "Active" = the undo's result stood. (An admin refund of an order the
      // undo just revived legitimately refunds AND re-cancels it; that is
      // one consistent outcome — refunded + cancelled — not both winning.)
      const active = o.status !== "cancelled";
      if (refunded && active) bad++; // the one state that must never exist
      if (!refunded && !active) bad++; // neither happened
      if (active && g.__stripeCalls.length) bad++; // back on, yet Stripe was asked
      if (active) undoWins++;
      for (const r of results) if (!r.ok) reasons.add(r.reason);
    }
    ok(bad === 0, "60 shuffled Undo/Refund pairs: never 'refunded AND active', never neither", `undo stood ${undoWins} times, refund ${60 - undoWins}; losers were told: ${[...reasons].sort().join(", ")}`);
    ok(undoWins > 0 && undoWins < 60, "…and both outcomes really occurred (the shuffle is doing its job)", String(undoWins));
  }

  // -- 11. Admin refund (no cancelledOnly) of an ACTIVE and of a COMPLETED order.
  {
    install(w.db);
    const id = await w.paidOrder("in_progress");
    const before = await w.stock();
    const r = await refundOrderNow(id, { cookId: w.kitchen });
    const o = await w.order(id);
    ok(r.ok && o.refunded_at !== null && o.status === "cancelled" && o.cancelled_at !== null, "admin refund of an active order: refunded and cancelled together");
    ok((await w.stock()) === before + 2, "…and its limited stock goes back on the shelf once");
    const done = await w.paidOrder("completed");
    const r2 = await refundOrderNow(done, { cookId: w.kitchen });
    const o2 = await w.order(done);
    ok(r2.ok && o2.refunded_at !== null && o2.status === "completed", "admin refund of a completed order keeps it 'completed' (history intact)");
  }

  // -- 12. The database fails at each step. Whatever happens, an order must
  //        never be left refunded-and-active, and nothing may fail open.
  {
    // (a) The claim can't be written: stop. Stripe is never asked.
    install(w.db);
    const a = await cancelled();
    g.__failWrite = (sql) => (/set refund_claimed_at/.test(sql) ? { code: "57014", message: "canceling statement due to statement timeout" } : null);
    const ra = await refundOrderNow(a, cook);
    ok(!ra.ok && ra.reason === "db_error" && g.__stripeCalls.length === 0, "claim write fails: refund stops, Stripe not asked", JSON.stringify(ra));

    // (b) An OUTAGE that mentions "schema cache" is not "migration missing":
    //     it must not drop the claim and refund unguarded.
    install(w.db);
    const b = await cancelled();
    g.__failWrite = (sql) => (/set refund_claimed_at/.test(sql) ? OUTAGE : null);
    const rb = await refundOrderNow(b, cook);
    ok(!rb.ok && rb.reason === "db_error" && g.__stripeCalls.length === 0, "an outage during the claim is NOT read as 'not migrated': Stripe not asked");
    // …and the same outage during an undo must not drop the claim check.
    install(w.db);
    const b2 = await cancelled();
    await w.db.query("update orders set refund_claimed_at = now() where id = $1", [b2]); // a refund is in flight
    g.__failWrite = (sql) => (/set status/.test(sql) ? OUTAGE : null);
    const rb2 = await reinstateCancelledOrder(b2, cookUndo);
    ok(!rb2.ok && rb2.reason === "db_error" && (await w.order(b2)).status === "cancelled", "an outage during an undo does NOT fall back to the unguarded flip");

    // (c) Stripe refunded, but recording it fails (cancelled order).
    install(w.db);
    const c = await cancelled();
    g.__failWrite = (sql) => (/set refunded_at/.test(sql) ? { code: "08006", message: "connection failure" } : null);
    const rc = await refundOrderNow(c, cook);
    let oc = await w.order(c);
    ok(!rc.ok && rc.reason === "not_recorded" && oc.refunded_at === null && oc.refund_claimed_at !== null, "refund sent but not recorded: reported, and the claim is KEPT");
    ok(!(await reinstateCancelledOrder(c, cookUndo)).ok, "…so the order cannot be put back");
    g.__failWrite = null;
    await w.db.query("update orders set refund_claimed_at = now() - interval '11 minutes' where id = $1", [c]);
    const sc = await callSweep();
    oc = await w.order(c);
    ok(sc.body.refunded === 1 && oc.refunded_at !== null && g.__stripeCalls.length === 2 && g.__stripeCalls[1].idempotencyKey === c, "…the next sweep replays the same Stripe request and records it");

    // (d) The same on an ACTIVE order (admin refund): the order must not be
    //     left active with the money gone. The sweep finishes it.
    install(w.db);
    const d = await w.paidOrder("ready");
    const stockBefore = await w.stock();
    g.__failWrite = (sql) => (/set refunded_at/.test(sql) ? { code: "08006", message: "connection failure" } : null);
    const rd = await refundOrderNow(d, { cookId: w.kitchen });
    let od = await w.order(d);
    ok(!rd.ok && rd.reason === "not_recorded" && od.status === "ready" && od.refund_claimed_at !== null && rd.error.includes("retried automatically"), "admin refund of an active order, record fails: claim kept, automatic retry promised");
    g.__failWrite = null;
    ok((await callSweep()).body.due === 0, "…the sweep leaves it alone while that attempt is still fresh");
    await w.db.query("update orders set refund_claimed_at = now() - interval '11 minutes' where id = $1", [d]);
    const sd = await callSweep();
    od = await w.order(d);
    ok(sd.body.refunded === 1 && od.refunded_at !== null && od.status === "cancelled" && (await w.stock()) === stockBefore + 2, "…then finishes it: refunded, cancelled and restocked in one go");

    // (e) Stripe says no, and giving the claim back fails: the order stays
    //     locked (safe), and a later attempt can still take over.
    install(w.db);
    const e = await cancelled();
    g.__stripe = NO;
    g.__failWrite = (sql) => (/set refund_failed_at/.test(sql) ? { code: "08006", message: "connection failure" } : null);
    const re = await refundOrderNow(e, cook);
    ok(!re.ok && re.reason === "stripe" && (await w.order(e)).refund_claimed_at !== null, "Stripe says no and the release fails: the claim simply stays (locked, not unsafe)");
    g.__failWrite = null;
    g.__stripe = YES;
    await w.db.query("update orders set refund_claimed_at = now() - interval '11 minutes' where id = $1", [e]);
    ok((await refundOrderNow(e, cook)).ok, "…and after ten minutes a new attempt takes over");

    // (f) A late-finishing attempt must not release a claim that is no
    //     longer its own.
    install(w.db);
    const f = await cancelled();
    g.__stripe = async () => {
      // While "Stripe" thinks, another attempt takes the (now stale) claim over.
      await w.db.query("update orders set refund_claimed_at = now() + interval '1 second' where id = $1", [f]);
      return NO();
    };
    await refundOrderNow(f, cook);
    ok((await w.order(f)).refund_claimed_at !== null, "an attempt that lost its claim does not release the new owner's");
  }

  // -- 13. The sweep.
  {
    install(w.db);
    await w.db.exec("delete from orders");
    ok((await callSweep(null)).status === 401 && (await callSweep("Bearer wrong")).status === 401, "sweep refuses a missing or wrong password");

    const mk = async (label, sql, status) => {
      const id = await w.paidOrder(status ?? "confirmed");
      if (!status) await w.cookCancels(id);
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
    const backingOff = await mk("failed 1h ago", "update orders set cancelled_at = now() - interval '30 hours', refund_failed_at = now() - interval '1 hour' where id = $1");
    const retryNow = await mk("failed 13h ago", "update orders set cancelled_at = now() - interval '40 hours', refund_failed_at = now() - interval '13 hours' where id = $1");
    const putBack = await mk("putBack", "update orders set cancelled_at = now() - interval '2 days' where id = $1");
    await reinstateCancelledOrder(putBack[1], cookUndo);
    const activeOld = await mk("active", null, "ready");
    install(w.db);

    const r = await callSweep();
    const refundedIds = new Set(g.__stripeCalls.map((c) => c.idempotencyKey));
    const want = [due1[1], due2[1], stalled[1], retryNow[1]];
    ok(r.status === 200 && r.body.refunded === 4 && r.body.failed === 0 && r.body.due === 4, "sweep reports 4 due, 4 refunded", JSON.stringify(r.body));
    ok(want.every((id) => refundedIds.has(id)) && refundedIds.size === 4, "sweep refunded exactly: two expired holds, the stuck refund, and the one whose back-off is over");
    for (const [label, id] of [fresh, almost, legacy, sending, backingOff]) {
      const o = await w.order(id);
      ok(o.refunded_at === null && o.status === "cancelled", `sweep left "${label}" alone`);
    }
    ok((await w.order(putBack[1])).status === "confirmed" && (await w.order(activeOld[1])).refunded_at === null, "sweep never touches an order that was put back, or an untouched active one");
    const adminNotes = emailsTo("admins");
    ok(adminNotes.length === 1 && adminNotes[0] === "Refunded automatically: 4 orders", "sweep leaves the admins one summary note", JSON.stringify(adminNotes));
    ok(emailsTo("buyer@example.com").filter((s) => s === "Refunded: your ForkFork order").length === 4, "…and each refunded buyer is emailed");

    install(w.db);
    const again = await callSweep();
    ok(again.body.refunded === 0 && again.body.due === 0 && g.__stripeCalls.length === 0 && g.__emails.length === 0, "running the sweep again right away does nothing", JSON.stringify(again.body));

    // Two sweeps at the same moment (both workflows firing together).
    install(w.db);
    await w.db.exec("delete from orders");
    for (let i = 0; i < 5; i++) await mk("twin" + i, "update orders set cancelled_at = now() - interval '30 hours' where id = $1");
    g.__jitter = true;
    const [s1, s2] = await Promise.all([callSweep(), callSweep()]);
    g.__jitter = false;
    const keys = g.__stripeCalls.map((c) => c.idempotencyKey);
    ok(s1.body.refunded + s2.body.refunded === 5 && s1.body.failed + s2.body.failed === 0 && new Set(keys).size === keys.length && keys.length === 5,
      "two sweeps at once: every order refunded exactly once, Stripe asked once per order", `${s1.body.refunded} + ${s2.body.refunded}, ${keys.length} Stripe calls`);

    // A failing refund: reported, backed off, retried later, never marked done.
    install(w.db);
    await w.db.exec("delete from orders");
    const bad = await mk("bad", "update orders set cancelled_at = now() - interval '26 hours' where id = $1");
    g.__stripe = async () => ({ error: "This charge has been disputed.", code: "charge_disputed", uncertain: false });
    const f = await callSweep();
    let o = await w.order(bad[1]);
    ok(
      f.status === 200 && f.body.failed === 1 && f.body.refunded === 0 && o.refunded_at === null && o.refund_claimed_at === null && o.refund_failed_at !== null,
      "a refund Stripe rejects: reported as failed, not marked refunded, claim released",
      JSON.stringify(f.body)
    );
    ok(
      emailsTo("admins")[0] === "Refund FAILED for 1 order" && g.__emails.find((e) => e.to === "admins").html.includes("This charge has been disputed."),
      "…admins get the failure and Stripe's reason"
    );
    install(w.db);
    g.__stripe = async () => ({ error: "This charge has been disputed.", code: "charge_disputed", uncertain: false });
    const f2 = await callSweep();
    ok(f2.body.due === 0 && g.__stripeCalls.length === 0 && g.__emails.length === 0, "…the next runs leave it alone: no Stripe call, no second email", JSON.stringify(f2.body));
    await w.db.query("update orders set refund_failed_at = now() - interval '13 hours' where id = $1", [bad[1]]);
    g.__stripe = YES;
    const retry = await callSweep();
    ok(retry.body.refunded === 1 && (await w.order(bad[1])).refunded_at !== null, "…twelve hours later it is tried again, and succeeds");

    // A database error on the claim is a FAILURE, not "nothing to do".
    install(w.db);
    await w.db.exec("delete from orders");
    await mk("dbdown", "update orders set cancelled_at = now() - interval '26 hours' where id = $1");
    g.__failWrite = (sql) => (/set refund_claimed_at/.test(sql) ? { code: "57014", message: "canceling statement due to statement timeout" } : null);
    const dberr = await callSweep();
    ok(dberr.body.failed === 1 && emailsTo("admins")[0] === "Refund FAILED for 1 order", "sweep reports a database error on the claim instead of swallowing it", JSON.stringify(dberr.body));
    // …and an outage on its own queries is an error answer, not "skipped".
    g.__failWrite = (sql) => (/^select/.test(sql) && /from orders/.test(sql) ? OUTAGE : null);
    const down = await callSweep();
    ok(down.status === 500 && !("skipped" in down.body), "sweep answers 500 during an outage (the workflow goes red), never 'skipped'", JSON.stringify(down));

    // Orders that keep failing must not crowd out the ones that will work.
    install(w.db);
    await w.db.exec("delete from orders");
    for (let i = 0; i < 11; i++) await mk("stuck" + i, "update orders set cancelled_at = now() - interval '5 days', refund_failed_at = now() - interval '13 hours' where id = $1");
    const newest = await mk("never failed", "update orders set cancelled_at = now() - interval '25 hours' where id = $1");
    g.__stripe = async (_pi, key) => (key === newest[1] ? YES() : { error: "This charge has been disputed.", code: "charge_disputed", uncertain: false });
    const crowded = await callSweep();
    ok(crowded.body.due === 12 && (await w.order(newest[1])).refunded_at !== null && crowded.body.more === true, "12 due but 11 keep failing: the one that can succeed goes first", JSON.stringify(crowded.body));

    // The cook put an order back and cancelled it AGAIN while the sweep was
    // busy with an earlier one: its hold is new, so it must not be refunded.
    install(w.db);
    await w.db.exec("delete from orders");
    const firstInLine = await mk("first", "update orders set cancelled_at = now() - interval '3 days' where id = $1");
    const changedMind = await mk("second", "update orders set cancelled_at = now() - interval '2 days' where id = $1");
    g.__stripe = async (_pi, key) => {
      if (key === firstInLine[1]) {
        await reinstateCancelledOrder(changedMind[1], cookUndo);
        await w.cookCancels(changedMind[1]);
      }
      return { id: "re_ok" };
    };
    const stale = await callSweep();
    o = await w.order(changedMind[1]);
    ok(stale.body.refunded === 1 && stale.body.failed === 0 && o.refunded_at === null && o.status === "cancelled" && o.refund_claimed_at === null,
      "an order put back and re-cancelled mid-sweep keeps its new 24-hour hold", JSON.stringify(stale.body));

    // More due than one run may move.
    install(w.db);
    await w.db.exec("delete from orders");
    for (let i = 0; i < 12; i++) await mk("bulk" + i, "update orders set cancelled_at = now() - interval '30 hours' where id = $1");
    const big = await callSweep();
    ok(big.body.due === 12 && big.body.refunded === 10 && big.body.more === true, "one run refunds at most 10 and says there are more", JSON.stringify(big.body));
    const rest = await callSweep();
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
  ok(hold.active === false && hold.cancelledAt === null && hold.claimed === false, "no migration: the hold reads as OFF (emails keep the old wording)");
  const r = await refundOrderNow(id, { cookId: w.kitchen });
  ok(r.ok && (await w.order(id)).refunded_at !== null && g.__stripeCalls.length === 1, "no migration: the admin Refund button still works", JSON.stringify(r));

  install(w.db);
  const active = await w.paidOrder("in_progress");
  const ra = await refundOrderNow(active, { cookId: w.kitchen });
  const oa = await w.order(active);
  ok(ra.ok && oa.refunded_at !== null && oa.status === "cancelled", "no migration: admin refund of an active order still refunds and cancels it");

  install(w.db);
  const id2 = await w.paidOrder();
  await w.cookCancels(id2);
  const u = await reinstateCancelledOrder(id2, { cookId: w.kitchen });
  ok(u.ok && (await w.order(id2)).status === "confirmed", "no migration: the admin Reinstate button still works", JSON.stringify(u));

  install(w.db);
  const id3 = await w.paidOrder();
  await w.cookCancels(id3);
  g.__stripe = NO;
  const f = await refundOrderNow(id3, { cookId: w.kitchen });
  ok(!f.ok && f.reason === "stripe" && (await w.order(id3)).refunded_at === null, "no migration: a Stripe failure is still reported cleanly");
  g.__stripe = SILENT;
  const s = await refundOrderNow(id3, { cookId: w.kitchen });
  ok(!s.ok && s.reason === "uncertain" && s.error.includes("Press Refund again") && !s.error.includes("automatically"), "no migration: Stripe silent promises NO automatic retry (nothing would do it)", s.ok ? "" : s.error);

  // The cook's buttons do nothing before the migration, even if called directly.
  install(w.db);
  const id4 = await w.paidOrder();
  await w.cookCancels(id4);
  const c1 = await refundOrderNow(id4, { cookId: w.kitchen, cancelledOnly: true, heldOnly: true });
  const c2 = await reinstateCancelledOrder(id4, { cookId: w.kitchen, heldOnly: true });
  ok(!c1.ok && c1.reason === "not_held" && !c2.ok && c2.reason === "not_held" && g.__stripeCalls.length === 0, "no migration: the cook's Refund now / Undo cancel are refused");

  install(w.db);
  const sw = await callSweep();
  ok(sw.status === 200 && typeof sw.body.skipped === "string" && g.__stripeCalls.length === 0, "no migration: the sweep reports 'not set up' and refunds nothing", JSON.stringify(sw.body));
  await w.db.close();
}

finish();
