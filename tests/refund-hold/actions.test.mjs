// Behavior test of the cook's REAL server actions
// (app/dashboard/orders/actions.ts): cancelling an order, "Refund now" and
// "Undo cancel" — who may press them, what each party is emailed, and that
// every email is TRUE whether or not migration 45 has been applied.
//
// The database is an in-process Postgres with the production order guard and
// migration 45 loaded verbatim (see fake-db.mjs); the cook's own statements
// run as the 'authenticated' role, so the guard and the cancel-time trigger
// behave as in production. Stand-ins (mocks/): who is signed in, Stripe,
// email, and Next's redirect / revalidate. Nothing touches Supabase, Stripe
// or Resend.
// How to run: see README.md in this folder (it needs the --tsconfig flag).
import {
  advanceOrder,
  refundCancelledOrder,
  undoCancelOrder,
} from "@/app/dashboard/orders/actions";
import { makeWorld, install, emailsTo, reporter } from "./fake-db.mjs";

const g = globalThis;
const { ok, finish } = reporter();
process.env.ADMIN_EMAILS = "boss@example.com";

const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
// Run an action the way Next does: a redirect() ends it by throwing.
const run = async (action, fields) => {
  try {
    await action(form(fields));
    return { redirect: null };
  } catch (e) {
    if (e && typeof e.redirectTo === "string") return { redirect: e.redirectTo };
    throw e;
  }
};
const signIn = (w, cookId = w.kitchen) => {
  g.__session = {
    user: { id: "user-1", email: "chef@example.com" },
    cook: { id: cookId, business_name: cookId === w.kitchen ? "40 Acres Test Kitchen" : "Someone Else" },
  };
};
const mail = (to) => g.__emails.filter((e) => e.to === to || (Array.isArray(e.to) && e.to.includes(to)));
const text = (e) => e.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// =================== WITH migration 45 ===================
{
  const w = await makeWorld(true);

  // -- 1. Cancel: the hold starts and all three parties are told the truth.
  {
    install(w.db);
    signIn(w);
    const id = await w.paidOrder("in_progress");
    const stockBefore = await w.stock();
    const r = await run(advanceOrder, { order_id: id, status: "cancelled" });
    const o = await w.order(id);
    ok(r.redirect === null && o.status === "cancelled" && o.cancelled_at !== null && o.refunded_at === null, "Cancel: order cancelled, cancel time stamped, nothing refunded yet");
    ok((await w.stock()) === stockBefore + 2 && g.__stripeCalls.length === 0, "…limited stock restocked once, Stripe not asked");

    const buyer = mail("buyer@example.com");
    ok(buyer.length === 1 && buyer[0].subject === "Order cancelled: 40 Acres Test Kitchen" && /refund will be sent to your original payment method within a day or two/.test(text(buyer[0])),
      "…buyer: refund 'within a day or two' (true under the hold)", buyer[0] && text(buyer[0]).slice(0, 200));
    const chef = mail("chef@example.com");
    ok(chef.length === 1 && /^You cancelled order #[0-9a-f]{8} · refund goes out [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M$/.test(chef[0].subject),
      "…cook: their own 'you cancelled' email, with when the refund goes out", chef[0]?.subject);
    ok(chef[0] && /Undo cancel/.test(text(chef[0])) && /Refund now/.test(text(chef[0])) && /Theresa's \$39\.18 order/.test(text(chef[0])), "…which names the buyer and both ways forward");
    const admins = mail("admins");
    ok(admins.length === 1 && /refund goes out by itself/.test(admins[0].subject) && /No action needed/.test(text(admins[0])), "…admins: 'no action needed'", admins[0]?.subject);
    ok(mail("boss@example.com").length === 0, "…and NO 'Refund owed' email");

    // A second click on Cancel changes nothing and emails nobody.
    install(w.db);
    signIn(w);
    await run(advanceOrder, { order_id: id, status: "cancelled" });
    ok(g.__emails.length === 0 && (await w.stock()) === stockBefore + 2, "a repeated Cancel does nothing more (no emails, no second restock)");

    // -- 2. Refund now.
    install(w.db);
    signIn(w);
    const rr = await run(refundCancelledOrder, { order_id: id });
    const o2 = await w.order(id);
    ok(rr.redirect === "/dashboard/orders?refund=sent" && o2.refunded_at !== null && g.__stripeCalls.length === 1, "Refund now: refunded, cook sent back with the 'sent' notice", rr.redirect);
    ok(emailsTo("buyer@example.com")[0] === "Refunded: your ForkFork order" && /^Refunded by the kitchen: order /.test(emailsTo("admins")[0] ?? ""), "…buyer told, admins left a record");
    const again = await run(refundCancelledOrder, { order_id: id });
    ok(again.redirect === "/dashboard/orders?refund_error=already_refunded" && g.__stripeCalls.length === 1, "pressing it again: a reason code, no second Stripe call", again.redirect);
  }

  // -- 3. Undo cancel.
  {
    install(w.db);
    signIn(w);
    const id = await w.paidOrder();
    await run(advanceOrder, { order_id: id, status: "cancelled" });
    install(w.db);
    signIn(w);
    const r = await run(undoCancelOrder, { order_id: id });
    const o = await w.order(id);
    ok(r.redirect === "/dashboard/orders?refund=undone" && o.status === "confirmed" && o.cancelled_at === null && g.__stripeCalls.length === 0, "Undo cancel: order back on, no refund, cook sent back with the 'undone' notice", r.redirect);
    ok(emailsTo("buyer@example.com")[0]?.startsWith("Your order is back on") && /^Cancel undone by the kitchen: order /.test(emailsTo("admins")[0] ?? ""), "…buyer told it's back on, admins left a record");
    // It can be cancelled again, which starts a brand new hold.
    install(w.db);
    signIn(w);
    await run(advanceOrder, { order_id: id, status: "cancelled" });
    ok((await w.order(id)).cancelled_at !== null && mail("chef@example.com").length === 1, "the order can be cancelled again: a fresh hold, a fresh email");
  }

  // -- 4. Who may press the buttons.
  {
    install(w.db);
    const id = await w.paidOrder();
    signIn(w);
    await run(advanceOrder, { order_id: id, status: "cancelled" });

    install(w.db);
    g.__session = { user: null, cook: null };
    const anon1 = await run(refundCancelledOrder, { order_id: id });
    const anon2 = await run(undoCancelOrder, { order_id: id });
    ok(anon1.redirect === "/login" && anon2.redirect === "/login", "not signed in: both buttons go to the login page");
    g.__session = { user: { id: "u", email: "buyer@x.com" }, cook: null };
    const nocook = await run(refundCancelledOrder, { order_id: id });
    ok(nocook.redirect === "/dashboard", "signed in without a kitchen: sent to the dashboard");

    signIn(w, w.other); // a different kitchen's cook
    const o1 = await run(refundCancelledOrder, { order_id: id });
    const o2 = await run(undoCancelOrder, { order_id: id });
    const row = await w.order(id);
    ok(o1.redirect === "/dashboard/orders?refund_error=not_yours" && o2.redirect === "/dashboard/orders?refund_error=not_yours" && row.status === "cancelled" && row.refunded_at === null,
      "another kitchen's cook can neither refund nor put back this order", `${o1.redirect} | ${o2.redirect}`);
    // …and cannot cancel another kitchen's active order either.
    const theirs = await w.paidOrder();
    await run(advanceOrder, { order_id: theirs, status: "cancelled" });
    ok((await w.order(theirs)).status === "confirmed", "another kitchen's cook cannot cancel this kitchen's order");
    ok(g.__stripeCalls.length === 0 && g.__emails.length === 0, "none of that reached Stripe or emailed anyone");

    signIn(w);
    const active = await w.paidOrder("ready");
    const a1 = await run(refundCancelledOrder, { order_id: active });
    const a2 = await run(undoCancelOrder, { order_id: active });
    ok(a1.redirect === "/dashboard/orders?refund_error=not_cancelled" && a2.redirect === "/dashboard/orders?refund_error=not_cancelled" && g.__stripeCalls.length === 0,
      "an order that isn't cancelled can't be refunded or 'put back' from the dashboard");
    const missing = await run(refundCancelledOrder, { order_id: "" });
    ok(missing.redirect === "/dashboard/orders", "a missing order id just returns to the Orders page");

    // A cancel that predates the hold: not the cook's to settle.
    const legacy = await w.paidOrder();
    await w.cookCancels(legacy);
    await w.db.query("update orders set cancelled_at = null where id = $1", [legacy]);
    const l1 = await run(refundCancelledOrder, { order_id: legacy });
    const l2 = await run(undoCancelOrder, { order_id: legacy });
    ok(l1.redirect === "/dashboard/orders?refund_error=not_held" && l2.redirect === "/dashboard/orders?refund_error=not_held" && g.__stripeCalls.length === 0, "a cancel from before the hold is refused for the cook");
  }

  // -- 5. When Stripe refuses or goes quiet: the cook gets a code, the admins
  //       get the details.
  {
    install(w.db);
    signIn(w);
    const id = await w.paidOrder();
    await run(advanceOrder, { order_id: id, status: "cancelled" });
    install(w.db);
    signIn(w);
    g.__stripe = async () => ({ error: "This charge has been disputed.", code: "charge_disputed", uncertain: false });
    const r = await run(refundCancelledOrder, { order_id: id });
    const note = mail("admins")[0];
    ok(r.redirect === "/dashboard/orders?refund_error=stripe" && (await w.order(id)).refunded_at === null, "Stripe refuses: cook sees a reason code, nothing marked refunded", r.redirect);
    ok(note && /^Refund now FAILED from the kitchen's dashboard: order /.test(note.subject) && text(note).includes("This charge has been disputed."), "…admins are told, with Stripe's own words", note?.subject);
    ok(!r.redirect.includes("disputed"), "…and Stripe's words never travel in the cook's URL");
    // The order is still theirs to put back.
    install(w.db);
    signIn(w);
    ok((await run(undoCancelOrder, { order_id: id })).redirect === "/dashboard/orders?refund=undone", "after a clear refusal the cook can still undo the cancel");
  }

  // -- 6. An admin's refund was already under way when the cook cancelled.
  {
    install(w.db);
    signIn(w);
    const id = await w.paidOrder("ready");
    await w.db.query("update orders set refund_claimed_at = now() - interval '20 minutes' where id = $1", [id]);
    await run(advanceOrder, { order_id: id, status: "cancelled" });
    const chef = mail("chef@example.com")[0];
    ok(chef && /^You cancelled order #[0-9a-f]{8}$/.test(chef.subject) && /already started refunding/.test(text(chef)) && !/Undo cancel/.test(text(chef)),
      "cancel on an order already being refunded: the cook is NOT offered an undo", chef?.subject);
    ok(/scheduled run will finish it/.test(text(mail("admins")[0] ?? { html: "" })), "…and the admins are told the run will finish it");
    install(w.db);
    signIn(w);
    const u = await run(undoCancelOrder, { order_id: id });
    ok(u.redirect === "/dashboard/orders?refund_error=changed" && (await w.order(id)).status === "cancelled", "…and pressing Undo anyway is refused", u.redirect);
  }

  // -- 7. Other status buttons are untouched by all this.
  {
    install(w.db);
    signIn(w);
    const id = await w.paidOrder();
    await run(advanceOrder, { order_id: id, status: "in_progress" });
    await run(advanceOrder, { order_id: id, status: "ready" });
    const o = await w.order(id);
    ok(o.status === "ready" && o.cancelled_at === null && emailsTo("buyer@example.com")[0]?.startsWith("Ready for pickup"), "I'm on it / Mark ready still work and start no hold");
    await run(advanceOrder, { order_id: id, status: "completed" });
    const done = await w.order(id);
    await run(advanceOrder, { order_id: id, status: "cancelled" });
    ok(done.status === "completed" && (await w.order(id)).status === "completed", "a completed order still cannot be cancelled by the cook");
  }
  await w.db.close();
}

// =================== WITHOUT migration 45 (code deployed first) ===================
{
  const w = await makeWorld(false);
  install(w.db);
  signIn(w);
  const id = await w.paidOrder();
  const r = await run(advanceOrder, { order_id: id, status: "cancelled" });
  const o = await w.order(id);
  ok(r.redirect === null && o.status === "cancelled", "no migration: Cancel works exactly as before");
  const buyer = mail("buyer@example.com")[0];
  ok(buyer && /We're refunding your full \$39\.18/.test(text(buyer)) && !/day or two/.test(text(buyer)), "no migration: buyer gets the OLD wording (no promise of an automatic refund)");
  const owed = mail("boss@example.com")[0];
  ok(owed && /^Refund owed: cancelled order /.test(owed.subject), "no migration: admins get 'Refund owed' — someone still has to click", owed?.subject);
  ok(mail("chef@example.com").length === 0 && mail("admins").length === 0, "no migration: no 'refund goes out by itself' emails to anyone");

  install(w.db);
  signIn(w);
  const r1 = await run(refundCancelledOrder, { order_id: id });
  const r2 = await run(undoCancelOrder, { order_id: id });
  ok(r1.redirect === "/dashboard/orders?refund_error=not_held" && r2.redirect === "/dashboard/orders?refund_error=not_held" && g.__stripeCalls.length === 0 && (await w.order(id)).status === "cancelled",
    "no migration: the cook's buttons are refused even if called directly", `${r1.redirect} | ${r2.redirect}`);
  await w.db.close();
}

// =================== Migration applied, but an order with no payment id ===================
{
  const w = await makeWorld(true);
  install(w.db);
  signIn(w);
  const id = await w.paidOrder();
  await w.db.query("update orders set stripe_payment_intent_id = null where id = $1", [id]);
  await run(advanceOrder, { order_id: id, status: "cancelled" });
  const owed = mail("boss@example.com")[0];
  ok(owed && /^Refund owed/.test(owed.subject) && mail("admins").length === 0 && mail("chef@example.com").length === 0,
    "an order the sweep could never refund (no payment id): admins get 'Refund owed', nobody is told it's automatic");
  await w.db.close();
}

finish();
