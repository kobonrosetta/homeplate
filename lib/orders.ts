import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, wrapEmail } from "@/lib/email";
import { formatUsd } from "@/lib/constants";

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

  const { data: confirmed } = await admin
    .from("orders")
    .update({ status: "confirmed", stripe_payment_intent_id: paymentIntentId })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id");
  if (!confirmed || confirmed.length === 0) return; // already handled

  const { data: lines } = await admin
    .from("order_items")
    .select("listing_id, quantity")
    .eq("order_id", orderId);

  for (const line of lines ?? []) {
    if (!line.listing_id) continue;
    const { data: listing } = await admin
      .from("listings")
      .select("limited_quantity, quantity_available")
      .eq("id", line.listing_id)
      .maybeSingle();
    if (listing?.limited_quantity) {
      const next = Math.max(0, (listing.quantity_available ?? 0) - line.quantity);
      await admin
        .from("listings")
        .update({ quantity_available: next })
        .eq("id", line.listing_id);
    }
  }

  // Best-effort: email the cook that they've got a paid order.
  try {
    const { data: order } = await admin
      .from("orders")
      .select(
        "cook_id, fulfillment, pickup_time, delivery_address, contact_name, contact_phone, contact_email, notes, subtotal_cents, order_items(title, quantity)"
      )
      .eq("id", orderId)
      .maybeSingle();
    if (order?.cook_id) {
      const { data: cook } = await admin
        .from("cooks")
        .select("business_name, profile_id")
        .eq("id", order.cook_id)
        .maybeSingle();
      const res = cook?.profile_id
        ? await admin.auth.admin.getUserById(cook.profile_id)
        : null;
      const cookEmail = res?.data?.user?.email;
      if (cookEmail) {
        const items = (order.order_items ?? [])
          .map((i: any) => `${i.quantity}× ${i.title}`)
          .join(", ");
        const where =
          order.fulfillment === "delivery"
            ? `Deliver to ${order.delivery_address ?? ""}`
            : `Pickup${order.pickup_time ? ` · ${order.pickup_time}` : ""}`;
        const contactLine = [
          order.contact_name ?? "Buyer",
          order.contact_phone,
          order.contact_email,
        ]
          .filter(Boolean)
          .join(" · ");
        await sendEmail({
          to: cookEmail,
          subject: `New order — ${cook?.business_name ?? "your kitchen"}`,
          html: wrapEmail(
            `<h2>You've got a new order</h2>
             <p><strong>${items}</strong></p>
             <p>${where}</p>
             <p>You receive <strong>${formatUsd(order.subtotal_cents ?? 0)}</strong></p>
             <p><strong>Buyer:</strong> ${contactLine}</p>
             ${order.notes ? `<p><strong>Note:</strong> ${order.notes}</p>` : ""}
             <p>Open My Kitchen to manage it.</p>`
          ),
        });
      }
    }
  } catch {
    /* notifications must never break order confirmation */
  }
}
