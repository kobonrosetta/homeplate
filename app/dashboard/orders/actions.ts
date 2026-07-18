"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, wrapEmail } from "@/lib/email";

// Statuses a cook is allowed to move an order into.
const ALLOWED = new Set(["ready", "completed", "cancelled"]);

export async function advanceOrder(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orderId = String(formData.get("order_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!orderId || !ALLOWED.has(status)) return;

  // The "cook updates own kitchen orders" RLS policy guarantees a cook can only
  // change orders that belong to their own kitchen.
  await supabase.from("orders").update({ status }).eq("id", orderId);

  // Best-effort: tell the buyer their order is ready for pickup.
  if (status === "ready") {
    try {
      const { data: order } = await supabase
        .from("orders")
        .select("contact_email, cook_id")
        .eq("id", orderId)
        .maybeSingle();
      if (order?.contact_email) {
        const { data: cook } = await supabase
          .from("cooks")
          .select("business_name")
          .eq("id", order.cook_id)
          .maybeSingle();
        await sendEmail({
          to: order.contact_email,
          subject: `Your order is ready${
            cook?.business_name ? ` — ${cook.business_name}` : ""
          }`,
          html: wrapEmail(
            `<h2>Your order is ready</h2>
             <p>${cook?.business_name ?? "The kitchen"} has your order ready. Check your confirmation email for the pickup details.</p>`
          ),
        });
      }
    } catch {
      /* ignore */
    }
  }

  revalidatePath("/dashboard/orders");
}
