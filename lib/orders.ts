import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, sendEmail, wrapEmail } from "@/lib/email";
import { formatUsd, SITE_URL } from "@/lib/constants";
import { formatDateLong } from "@/lib/availability";
import { pickupLocation } from "@/lib/handoff";

// Inline email link/button — matches the brand accent in wrapEmail.
function emailLink(href: string, label: string): string {
  return `<a href="${href}" style="color:#b45309;font-weight:600;text-decoration:none">${label}</a>`;
}

/**
 * Mark a paid order confirmed and deduct stock for limited items — exactly once.
 *
 * Called by BOTH the Stripe webhook and the /checkout/success redirect. The
 * `status = 'pending'` guard means whichever runs first wins and the other is a
 * no-op, so an order is never double-confirmed and stock is never
 * double-decremented.
 */
export async function confirmPaidOrder(
  orderId: string,
  paymentIntentId: string | null
): Promise<void> {
  const admin = createAdminClient();

  const { data: confirmed, error: confirmErr } = await admin
    .from("orders")
    .update({ status: "confirmed", stripe_payment_intent_id: paymentIntentId })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id, custom_request_id, cook_id");
  // A FAILED update (DB hiccup) must throw so the webhook 5xxes and Stripe
  // retries — swallowing it would 200-ack a paid order stuck in 'pending'
  // forever. (Zero MATCHED rows is different: that's the idempotent
  // already-handled case below.)
  if (confirmErr) {
    console.error("confirmPaidOrder: order update failed", orderId, confirmErr);
    throw new Error("Order confirmation write failed");
  }
  if (!confirmed || confirmed.length === 0) return; // already handled

  // A paid payment-link order retires its link (idempotent — the pending
  // guard above means this runs at most once per order).
  const requestId = confirmed[0].custom_request_id;
  const orderCookId = confirmed[0].cook_id;
  if (requestId) {
    await admin
      .from("custom_requests")
      .update({ status: "paid" })
      .eq("id", requestId)
      .eq("status", "open");
  }

  const { data: lines } = await admin
    .from("order_items")
    .select("listing_id, quantity")
    .eq("order_id", orderId);

  for (const line of lines ?? []) {
    if (!line.listing_id) continue;
    const { data: listing } = await admin
      .from("listings")
      .select("limited_quantity, quantity_available, cook_id")
      .eq("id", line.listing_id)
      .maybeSingle();
    // Defense-in-depth: only ever touch stock for a listing that belongs to
    // THIS order's cook, so no cross-cook line item can zero a competitor's
    // inventory (order_items are server-authored now, but belt-and-braces).
    if (listing?.limited_quantity && listing.cook_id === orderCookId) {
      const have = listing.quantity_available ?? 0;
      const next = Math.max(0, have - line.quantity);
      await admin
        .from("listings")
        .update({ quantity_available: next })
        .eq("id", line.listing_id);
      // Oversell tripwire: a paid order that clamps below zero means two
      // buyers paid for the same last portions (stale session / race). The
      // charge already happened, so alert the admins to arrange the fix
      // (extra portions or a refund — remember reverse_transfer +
      // refund_application_fee on a destination charge). Best-effort.
      if (have - line.quantity < 0) {
        try {
          const admins = (process.env.ADMIN_EMAILS ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (admins.length) {
            await sendEmail({
              to: admins,
              subject: `OVERSOLD: order ${orderId.slice(0, 8)} paid past available stock`,
              html: wrapEmail(
                `<h2>A paid order exceeded available stock</h2>
                 <p>Order <strong>${escapeHtml(orderId)}</strong> confirmed with
                 more units than listing ${escapeHtml(String(line.listing_id))}
                 had left. The buyer HAS been charged. Contact the chef about an
                 extra portion, or refund in the Stripe dashboard — this order
                 paid the chef via Connect, so the refund must set
                 <code>reverse_transfer=true</code> and
                 <code>refund_application_fee=true</code>.</p>`
              ),
            });
          }
        } catch {
          /* alerting must never break confirmation */
        }
      }
    }
  }

  await notifyOrderConfirmed(admin, orderId);
}

/**
 * Put stock back for a cancelled order's limited items — the mirror of the
 * deduction in confirmPaidOrder. The caller must only invoke this after an
 * update that actually transitioned the order into 'cancelled' (matched rows
 * > 0), which is what prevents a retried cancel from restocking twice.
 */
export async function restockOrderItems(orderId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("cook_id")
    .eq("id", orderId)
    .maybeSingle();
  const orderCookId = order?.cook_id ?? null;
  const { data: lines } = await admin
    .from("order_items")
    .select("listing_id, quantity")
    .eq("order_id", orderId);

  for (const line of lines ?? []) {
    if (!line.listing_id) continue;
    const { data: listing } = await admin
      .from("listings")
      .select("limited_quantity, quantity_available, cook_id")
      .eq("id", line.listing_id)
      .maybeSingle();
    // Mirror of the deduction guard — only restock a listing owned by this
    // order's cook.
    if (listing?.limited_quantity && listing.cook_id === orderCookId) {
      await admin
        .from("listings")
        .update({
          quantity_available: (listing.quantity_available ?? 0) + line.quantity,
        })
        .eq("id", line.listing_id);
    }
  }
}

async function notifyOrderConfirmed(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string
): Promise<void> {
  // Best-effort notifications — must never break order confirmation.
  try {
    const { data: order } = await admin
      .from("orders")
      .select(
        "buyer_id, cook_id, fulfillment, pickup_time, ready_by_date, delivery_address, contact_name, contact_phone, contact_email, notes, subtotal_cents, total_cents, stripe_payment_intent_id, order_items(title, quantity)"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (order?.cook_id) {
      const { data: cook } = await admin
        .from("cooks")
        .select("business_name, city, profile_id")
        .eq("id", order.cook_id)
        .maybeSingle();

      // The exact pickup spot (home street, or a cook-chosen meetup point) and
      // the kitchen's contact phone are both read server-side so the buyer's
      // email carries the real handoff details (durable record), not a
      // promise to send them later. Neither is ever shown pre-order.
      const { data: priv } = await admin
        .from("cook_private")
        .select("street_address, pickup_location")
        .eq("cook_id", order.cook_id)
        .maybeSingle();
      const { data: cookProfile } = cook?.profile_id
        ? await admin
            .from("profiles")
            .select("phone")
            .eq("id", cook.profile_id)
            .maybeSingle()
        : { data: null as { phone: string | null } | null };
      const pickupAddr = pickupLocation(
        priv?.street_address,
        cook?.city,
        priv?.pickup_location
      );
      const kitchenPhone = cookProfile?.phone?.trim() || null;

      // Everything user-typed gets escaped — email HTML is an injection target.
      const kitchen = escapeHtml(cook?.business_name ?? "the kitchen");
      const items = (order.order_items ?? [])
        .map((i: any) => `${i.quantity}× ${escapeHtml(i.title)}`)
        .join(", ");
      // Plain (unescaped) item summary for the subject line, capped so an inbox
      // preview stays scannable.
      const plainItems = (order.order_items ?? [])
        .map((i: any) => `${i.quantity}× ${i.title}`)
        .join(", ");
      const subjectItems =
        plainItems.length > 60 ? `${plainItems.slice(0, 57)}…` : plainItems;
      const where =
        order.fulfillment === "delivery"
          ? `Deliver to ${escapeHtml(order.delivery_address ?? "")}`
          : `Pickup${
              order.pickup_time ? ` · ${escapeHtml(order.pickup_time)}` : ""
            }`;
      // The concrete "you'll get it by" date, frozen on the order at checkout.
      const readyByLine = order.ready_by_date
        ? `<p><strong>Ready by:</strong> ${formatDateLong(order.ready_by_date)}</p>`
        : "";
      // Stripe payment reference — the buyer can quote this to us for any
      // question about the charge, and it's directly searchable in Stripe.
      const paymentRefLine = order.stripe_payment_intent_id
        ? `<p style="color:#6b7280;font-size:13px;margin-top:16px"><strong>Payment ID:</strong> ${escapeHtml(
            order.stripe_payment_intent_id
          )}<br/>Quote this if you contact us about your order.</p>`
        : "";

      // The buyer-facing handoff block: real address/time for pickup, the
      // delivery address for delivery, plus the kitchen's contact if set.
      const buyerHandoff =
        order.fulfillment === "delivery"
          ? `<p><strong>Delivering to:</strong> ${escapeHtml(
              order.delivery_address ?? ""
            )}</p>`
          : `<p><strong>Pickup${
              order.pickup_time ? ` · ${escapeHtml(order.pickup_time)}` : ""
            }:</strong> ${
              pickupAddr
                ? escapeHtml(pickupAddr)
                : `${kitchen} will message you the pickup address.`
            }</p>`;
      const contactLineBuyer = kitchenPhone
        ? `<p><strong>Reach the kitchen:</strong> ${escapeHtml(
            kitchenPhone
          )}</p>`
        : "";

      // 1) Alert the cook that they've got a paid order.
      const res = cook?.profile_id
        ? await admin.auth.admin.getUserById(cook.profile_id)
        : null;
      const cookEmail = res?.data?.user?.email;
      if (cookEmail) {
        const contactLine = [
          order.contact_name ?? "Buyer",
          order.contact_phone,
          order.contact_email,
        ]
          .filter(Boolean)
          .map((v) => escapeHtml(String(v)))
          .join(" · ");
        await sendEmail({
          to: cookEmail,
          subject: subjectItems ? `New paid order: ${subjectItems}` : "New paid order",
          html: wrapEmail(
            `<h2>You've got a new order</h2>
             <p><strong>${items}</strong></p>
             ${readyByLine}
             <p>${where}</p>
             <p>You receive <strong>${formatUsd(order.subtotal_cents ?? 0)}</strong></p>
             <p><strong>Buyer:</strong> ${contactLine}</p>
             ${
               order.notes
                 ? `<p><strong>Note:</strong> ${escapeHtml(order.notes)}</p>`
                 : ""
             }
             <p>${emailLink(
               `${SITE_URL}/dashboard/orders`,
               "Open your orders →"
             )} Tap "I'm on it" so your buyer knows it's in hand.</p>`
          ),
        });
      }

      // 2) Send the buyer their receipt / confirmation. Guest checkouts run on
      // an anonymous account with no Purchases page, so only signed-in buyers
      // get the "find it under Purchases" line — guests are pointed at the
      // email itself as their record.
      if (order.contact_email) {
        let buyerIsGuest = false;
        if (order.buyer_id) {
          const bu = await admin.auth.admin.getUserById(order.buyer_id);
          buyerIsGuest = Boolean(bu?.data?.user?.is_anonymous);
        }
        const receiptLine = buyerIsGuest
          ? `<p>This email is your receipt. Keep it for the pickup details above.</p>`
          : `<p>${emailLink(
              `${SITE_URL}/orders`,
              "See your orders"
            )} anytime, or keep this email as your receipt.</p>`;
        await sendEmail({
          to: order.contact_email,
          subject: `Order confirmed: ${kitchen}`,
          html: wrapEmail(
            `<h2>Your order is confirmed</h2>
             <p>Thanks${
               order.contact_name ? `, ${escapeHtml(order.contact_name)}` : ""
             }! ${kitchen} has your order.</p>
             <p><strong>${items}</strong></p>
             <p>You paid <strong>${formatUsd(order.total_cents ?? 0)}</strong></p>
             ${readyByLine}
             ${buyerHandoff}
             ${contactLineBuyer}
             ${receiptLine}
             ${paymentRefLine}`
          ),
        });
      }
    }
  } catch {
    /* notifications must never break order confirmation */
  }
}
