"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { restockOrderItems } from "@/lib/orders";
import { escapeHtml, notifyAdmins, sendEmail, wrapEmail } from "@/lib/email";
import { formatUsd, SITE_URL, SUPPORT_EMAIL } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatHoldTime, refundDueAt } from "@/lib/refund-hold";
import {
  readRefundHold,
  refundOrderNow,
  reinstateCancelledOrder,
  type MoneyMoveFailure,
} from "@/lib/refunds";

// Target status -> the statuses an order may come FROM. Pending never appears:
// an unpaid order can't be advanced, completed, or cancelled by a cook — only
// Stripe-verified confirmation (server-side) moves an order out of pending.
const TRANSITIONS: Record<string, string[]> = {
  in_progress: ["confirmed"],
  ready: ["confirmed", "in_progress"],
  completed: ["confirmed", "in_progress", "ready"],
  cancelled: ["confirmed", "in_progress", "ready"],
};

export async function advanceOrder(formData: FormData) {
  const supabase = createClient();
  const { user, cook } = await getCurrentCook();
  if (!user) redirect("/login");
  if (!cook) redirect("/dashboard");

  const orderId = String(formData.get("order_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const from = TRANSITIONS[status];
  if (!orderId || !from) return;

  // Scope to this cook's kitchen (RLS enforces this too) and to a legal
  // predecessor status. Zero matched rows = stale button or a retry — do
  // nothing, which is also what makes the cancel restock run at most once.
  const { data: updated } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .eq("cook_id", cook.id)
    .in("status", from)
    .select("id");
  if (!updated || updated.length === 0) {
    revalidatePath("/dashboard/orders");
    return;
  }

  // A cancelled order's limited items go back on the shelf.
  if (status === "cancelled") await restockOrderItems(orderId);

  // Buyer-facing notifications on the transitions they care about. Best-effort
  // — a failed email must never break the cook's status update. The transition
  // guard above means each of these sends at most once per order (a re-click
  // matches zero rows and returns early).
  if (status === "ready" || status === "cancelled" || status === "completed") {
    try {
      const { data: order } = await supabase
        .from("orders")
        .select(
          "contact_email, contact_name, fulfillment, total_cents, buyer_id, stripe_payment_intent_id"
        )
        .eq("id", orderId)
        .maybeSingle();
      const kitchen = cook?.business_name ?? "The kitchen";

      if (status === "ready" && order?.contact_email) {
        // Delivery orders aren't "ready for pickup" — they're on the way.
        const delivery = order.fulfillment === "delivery";
        await sendEmail({
          to: order.contact_email,
          subject: `${delivery ? "On the way" : "Ready for pickup"}: ${kitchen}`,
          html: wrapEmail(
            delivery
              ? `<h2>Your order is on the way</h2>
                 <p>${escapeHtml(kitchen)} is delivering your order now.
                 Your confirmation email has the delivery address and the
                 kitchen's contact.</p>`
              : `<h2>Your order is ready for pickup</h2>
                 <p>${escapeHtml(kitchen)} has your order ready. Your
                 confirmation email has the pickup address, time, and the
                 kitchen's contact.</p>`
          ),
        });
      }

      if (status === "cancelled") {
        // A cancel starts a refund HOLD (lib/refund-hold.ts): the money stays
        // put for REFUND_HOLD_HOURS, during which this cook can undo the
        // cancel or send the refund at once; after that the scheduled sweep
        // sends it. The hold only exists once migration 45 is applied (its
        // trigger stamps the cancel time) — until then refunds are still an
        // admin click, and every email below says whichever is true.
        const hold = await readRefundHold(orderId);
        // "Goes out by itself" is only true when the hold is in force AND
        // there is a payment the sweep can refund. Otherwise this falls back
        // to the old wording and the admin's "Refund owed" email.
        const auto = hold.active && Boolean(order?.stripe_payment_intent_id);
        const dueIso = auto ? refundDueAt(hold.cancelledAt) : null;
        const due = dueIso ? formatHoldTime(dueIso) : null;
        // A refund had ALREADY been started on this order before the cancel
        // (an admin's, not yet finished). It can't be put back and the sweep
        // will finish it — so the cook must not be offered an undo.
        const alreadyRefunding = Boolean(due) && hold.claimed;
        const short = String(orderId).slice(0, 8);
        const amount = formatUsd(order?.total_cents ?? 0);

        if (order?.contact_email) {
          await sendEmail({
            to: order.contact_email,
            subject: `Order cancelled: ${kitchen}`,
            html: wrapEmail(
              `<h2>Your order was cancelled</h2>
               <p>${escapeHtml(kitchen)} had to cancel your order${
                 order.contact_name
                   ? `, ${escapeHtml(order.contact_name)}`
                   : ""
               }. ${
                 due
                   ? `Your full ${amount} refund will be sent to your original payment method within a day or two. After that, banks take a few business days to show it.`
                   : `We're refunding your full ${amount} to your original payment method — it can take a few business days to land.`
               } If it hasn't appeared by then, email ${escapeHtml(
                 SUPPORT_EMAIL
               )} and we'll chase it down.</p>`
            ),
          });
        }

        if (due) {
          // The cook's own record of the cancel, with the way back: nothing
          // else tells a cook who tapped Cancel by mistake that they did.
          const whose = order?.contact_name
            ? `${escapeHtml(order.contact_name)}'s`
            : "a buyer's";
          if (user.email) {
            await sendEmail({
              to: user.email,
              subject: alreadyRefunding
                ? `You cancelled order #${short}`
                : `You cancelled order #${short} · refund goes out ${due}`,
              html: wrapEmail(
                `<h2>Order #${escapeHtml(short)} is cancelled</h2>
                 <p>You cancelled ${whose} ${amount} order, and they've been
                 emailed.</p>
                 ${
                   alreadyRefunding
                     ? `<p>ForkFork had already started refunding this order,
                        so it can't be put back. The refund will finish on its
                        own. There's nothing more for you to do.</p>`
                     : `<p>Their refund goes out automatically on
                        <strong>${escapeHtml(due)}</strong> (Pacific time).
                        Until then, on your Orders page you can:</p>
                        <ul>
                          <li><strong>Undo cancel</strong> if it was a
                          mistake. The order goes back on and the buyer is
                          told.</li>
                          <li><strong>Refund now</strong> to send the money
                          back right away.</li>
                        </ul>`
                 }
                 <p><a href="${SITE_URL}/dashboard/orders" style="color:#b45309;font-weight:600;text-decoration:none">Open your orders →</a></p>`
              ),
            });
          }
          await notifyAdmins(
            `Cancelled: order ${short} · refund goes out by itself`,
            `<h2>No action needed</h2>
             <p>${escapeHtml(kitchen)} cancelled order <strong>${escapeHtml(
               String(orderId)
             )}</strong> (${amount}${
               order?.contact_name
                 ? `, ${escapeHtml(order.contact_name)}`
                 : ""
             }).</p>
             ${
               alreadyRefunding
                 ? `<p>A refund had already been started on this order and
                    not finished. The scheduled run will finish it; the
                    kitchen cannot put this order back.</p>`
                 : `<p>The refund goes out automatically around
                    <strong>${escapeHtml(due)}</strong> Pacific, unless the
                    kitchen undoes the cancel or sends the refund sooner. You
                    can still Refund or Reinstate it yourself from the admin
                    console.</p>`
             }`
          );
        }

        const admins = (process.env.ADMIN_EMAILS ?? "")
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);
        if (!due && admins.length > 0) {
          await sendEmail({
            to: admins,
            subject: `Refund owed: cancelled order ${String(orderId).slice(0, 8)}`,
            html: wrapEmail(
              `<h2>Refund needed — one click in the admin console</h2>
               <p>${escapeHtml(kitchen)} cancelled order <strong>${escapeHtml(
                 String(orderId)
               )}</strong>. Refund <strong>${formatUsd(
                 order?.total_cents ?? 0
               )}</strong> to the buyer:</p>
               <p><strong>Use the Refund button on the order</strong> in the admin
               console (Admin &rarr; the kitchen &rarr; this order). It handles the
               Connect mechanics automatically — reverses the chef's transfer and
               returns the service fee — so nothing can be forgotten. Avoid
               refunding by hand in the Stripe dashboard; a naive refund there
               leaves the chef their cut and ForkFork eating the whole refund
               (if you ever must: <code>reverse_transfer=true,
               refund_application_fee=true</code>).</p>
               <p>Refund promptly: once the chef's earnings pay out to their bank
               (~2 business days), reversing can drive their Stripe balance
               negative (ForkFork covers the shortfall).</p>`
            ),
          });
        }
      }

      if (status === "completed" && order?.contact_email) {
        // Review ask — reviews are the storefront's trust currency, and buyers
        // forget unless nudged at the moment the meal is fresh. Guests (an
        // anonymous checkout session) can't reach the Purchases review form
        // from an email link, so they get a reply-to-us version instead —
        // still feedback, still a support channel.
        let buyerIsGuest = false;
        if (order.buyer_id) {
          const bu = await createAdminClient().auth.admin.getUserById(
            order.buyer_id
          );
          buyerIsGuest = Boolean(bu?.data?.user?.is_anonymous);
        }
        const first = order.contact_name
          ? `, ${escapeHtml(order.contact_name)}`
          : "";
        await sendEmail({
          to: order.contact_email,
          subject: `How was ${kitchen}?`,
          html: wrapEmail(
            buyerIsGuest
              ? `<h2>How was it${first}?</h2>
                 <p>We hope ${escapeHtml(kitchen)} hit the spot.</p>
                 <p>Loved it — or didn't? <strong>Just reply to this email</strong>
                 and tell us. We read everything, and we'll pass it straight to
                 the chef.</p>`
              : `<h2>How was it${first}?</h2>
                 <p>We hope ${escapeHtml(kitchen)} hit the spot.</p>
                 <p>Would you leave a quick review? For a home chef, a review
                 from a real order means everything — it's what tells the next
                 neighbor this food is worth trying.</p>
                 <p style="margin:22px 0">
                   <a href="${SITE_URL}/orders"
                      style="background:#b45309;color:#ffffff;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:999px;display:inline-block">
                     Leave a review &rarr;
                   </a>
                 </p>`
          ),
        });
      }
    } catch {
      /* notifications must never break the status update */
    }
  }

  revalidatePath("/dashboard/orders");
}

// ---- The two buttons on a cancelled order whose money hasn't moved yet ----
//
// Both are thin: prove who is asking (a signed-in cook), then hand the order
// id and THIS cook's kitchen id to the shared routines in lib/refunds.ts,
// which re-check that the order belongs to that kitchen before touching it
// with the service role. A cook can only ever refund or put back their own
// kitchen's CANCELLED orders, and only ones cancelled under the hold
// (`heldOnly`); refunds of fulfilled orders, and of older cancels, stay with
// the admin.
//
// On failure the cook is sent back with a short REASON code, which the page
// turns into its own wording — never free text in the URL. The full error
// (Stripe's words, for instance) goes to the admins instead, who can act on
// it.

// Failures that mean something is actually wrong, as opposed to "that button
// no longer applies".
const WORTH_TELLING_ADMINS = new Set([
  "stripe",
  "uncertain",
  "not_recorded",
  "db_error",
]);

async function tellAdminsItFailed(
  what: string,
  kitchen: string,
  orderId: string,
  result: MoneyMoveFailure
) {
  if (!WORTH_TELLING_ADMINS.has(result.reason)) return;
  await notifyAdmins(
    `${what} FAILED from the kitchen's dashboard: order ${orderId.slice(0, 8)}`,
    `<h2>${escapeHtml(what)} did not go through</h2>
     <p>${escapeHtml(kitchen)} pressed the button for order
     <strong>${escapeHtml(orderId)}</strong> and it failed
     (${escapeHtml(result.reason)}):</p>
     <p>${escapeHtml(result.error)}</p>
     <p>The kitchen was told ForkFork has been notified. You can try the
     Refund button in the admin console to see the error first-hand.</p>`
  );
}

// "Refund now" — send the buyer's money back without waiting out the hold.
export async function refundCancelledOrder(formData: FormData) {
  const { user, cook } = await getCurrentCook();
  if (!user) redirect("/login");
  if (!cook) redirect("/dashboard");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/dashboard/orders");
  const kitchen = String(cook.business_name ?? "A kitchen");

  const result = await refundOrderNow(orderId, {
    cookId: cook.id,
    cancelledOnly: true,
    heldOnly: true,
  });
  revalidatePath("/dashboard/orders");
  if (!result.ok) {
    await tellAdminsItFailed("Refund now", kitchen, orderId, result);
    redirect(`/dashboard/orders?refund_error=${result.reason}`);
  }

  // A money event the admins didn't click: leave them a record.
  await notifyAdmins(
    `Refunded by the kitchen: order ${orderId.slice(0, 8)}`,
    `<h2>No action needed</h2>
     <p>${escapeHtml(kitchen)} refunded order
     <strong>${escapeHtml(result.order.id)}</strong> (${formatUsd(
       result.order.totalCents
     )}${
       result.order.buyerName ? `, ${escapeHtml(result.order.buyerName)}` : ""
     }) from their dashboard. The transfer was reversed, the service fee
     returned and the buyer emailed.</p>`
  );
  redirect("/dashboard/orders?refund=sent");
}

// "Undo cancel" — the cancel was a mistake; put the order back on.
export async function undoCancelOrder(formData: FormData) {
  const { user, cook } = await getCurrentCook();
  if (!user) redirect("/login");
  if (!cook) redirect("/dashboard");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/dashboard/orders");
  const kitchen = String(cook.business_name ?? "A kitchen");

  const result = await reinstateCancelledOrder(orderId, {
    cookId: cook.id,
    heldOnly: true,
  });
  revalidatePath("/dashboard/orders");
  if (!result.ok) {
    await tellAdminsItFailed("Undo cancel", kitchen, orderId, result);
    redirect(`/dashboard/orders?refund_error=${result.reason}`);
  }

  await notifyAdmins(
    `Cancel undone by the kitchen: order ${orderId.slice(0, 8)}`,
    `<h2>No action needed</h2>
     <p>${escapeHtml(kitchen)} put order
     <strong>${escapeHtml(result.order.id)}</strong> (${formatUsd(
       result.order.totalCents
     )}${
       result.order.buyerName ? `, ${escapeHtml(result.order.buyerName)}` : ""
     }) back on after cancelling it. No refund was sent, and the buyer was
     emailed that the order is on again.</p>`
  );
  redirect("/dashboard/orders?refund=undone");
}
