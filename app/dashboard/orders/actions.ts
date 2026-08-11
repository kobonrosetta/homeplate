"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { restockOrderItems } from "@/lib/orders";
import { escapeHtml, sendEmail, wrapEmail } from "@/lib/email";
import { formatUsd, SITE_URL, SUPPORT_EMAIL } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";

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
        .select("contact_email, contact_name, fulfillment, total_cents, buyer_id")
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
               }. We're refunding your full ${formatUsd(
                 order.total_cents ?? 0
               )} to your original payment method — it can take a few business days to land. If it hasn't appeared by then, email ${escapeHtml(
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
               <p><strong>Important: this order paid the chef via Connect.</strong>
               When you issue the refund you MUST also <strong>reverse the transfer</strong>
               and <strong>refund the application fee</strong>
               (API: <code>reverse_transfer=true, refund_application_fee=true</code>).
               Otherwise the chef keeps their cut and ForkFork eats the whole refund.</p>
               <p>If the chef's earnings have already paid out to their bank, reversing can
               drive their Stripe balance negative (ForkFork covers the shortfall), so
               refund before their payout settles whenever possible.</p>`
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
