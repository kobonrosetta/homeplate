"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { restockOrderItems } from "@/lib/orders";
import { escapeHtml, sendEmail, wrapEmail } from "@/lib/email";

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

  // Best-effort: tell the buyer their order is ready for pickup.
  if (status === "ready") {
    try {
      const { data: order } = await supabase
        .from("orders")
        .select("contact_email")
        .eq("id", orderId)
        .maybeSingle();
      if (order?.contact_email) {
        await sendEmail({
          to: order.contact_email,
          subject: `Your order is ready${
            cook?.business_name ? ` — ${cook.business_name}` : ""
          }`,
          html: wrapEmail(
            `<h2>Your order is ready</h2>
             <p>${escapeHtml(
               cook?.business_name ?? "The kitchen"
             )} has your order ready. Check your confirmation email for the pickup details.</p>`
          ),
        });
      }
    } catch {
      /* ignore */
    }
  }

  revalidatePath("/dashboard/orders");
}
