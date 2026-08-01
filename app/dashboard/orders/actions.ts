"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { restockOrderItems } from "@/lib/orders";
import { escapeHtml, sendEmail, wrapEmail } from "@/lib/email";
import { formatUsd, SUPPORT_EMAIL } from "@/lib/constants";

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
  // — a failed email must never break the cook's status update.
  if (status === "ready" || status === "cancelled") {
    try {
      const { data: order } = await supabase
        .from("orders")
        .select("contact_email, contact_name, fulfillment, total_cents")
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
                 confirmation email (and Purchases) has the pickup address,
                 time, and the kitchen's contact.</p>`
          ),
        });
      }

      if (status === "cancelled") {
        // Tell the buyer, and — because refunds are MANUAL in the pilot — alert
        // the admins. Connect IS built now, so the order paid the cook via a
        // destination charge: a naive refund would leave the cook their cut and
        // ForkFork out of pocket, so the admin email spells out the correct steps.
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
               }. Your full ${formatUsd(
                 order.total_cents ?? 0
               )} refund is on the way. If it hasn't appeared in a few days, email ${escapeHtml(
                 SUPPORT_EMAIL
               )} and we'll chase it down.</p>`
            ),
          });
        }
        const admins = (process.env.ADMIN_EMAILS ?? "")
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);
        if (admins.length > 0) {
          await sendEmail({
            to: admins,
            subject: `Refund owed: cancelled order ${String(orderId).slice(0, 8)}`,
            html: wrapEmail(
              `<h2>Manual refund needed</h2>
               <p>${escapeHtml(kitchen)} cancelled order <strong>${escapeHtml(
                 String(orderId)
               )}</strong>. Refund <strong>${formatUsd(
                 order?.total_cents ?? 0
               )}</strong> to the buyer in the Stripe dashboard.</p>
               <p><strong>Important: this order paid the cook via Connect.</strong>
               When you issue the refund you MUST also <strong>reverse the transfer</strong>
               and <strong>refund the application fee</strong>
               (API: <code>reverse_transfer=true, refund_application_fee=true</code>).
               Otherwise the cook keeps their cut and ForkFork eats the whole refund.</p>
               <p>If the cook's earnings have already paid out to their bank, reversing can
               drive their Stripe balance negative (ForkFork covers the shortfall), so
               refund before their payout settles whenever possible.</p>`
            ),
          });
        }
      }
    } catch {
      /* notifications must never break the status update */
    }
  }

  revalidatePath("/dashboard/orders");
}
