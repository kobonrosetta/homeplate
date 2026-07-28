"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";

// Mint a payment link for a DM-negotiated custom order. The cook types what
// was agreed and the price; we hand back /pay/<token> to paste into the chat.
// The token is unguessable (16 random bytes) and is the ONLY way to reach the
// request — there's no public read on the table.
export async function createPaymentRequest(formData: FormData) {
  const supabase = createClient();
  const { user, cook } = await getCurrentCook();
  if (!user) redirect("/login");
  if (!cook) redirect("/dashboard");

  const title = String(formData.get("title") ?? "").trim();
  const priceDollars = parseFloat(String(formData.get("price") ?? ""));
  const chargeKind =
    String(formData.get("charge_kind") ?? "full") === "deposit"
      ? "deposit"
      : "full";
  const pickupDate = String(formData.get("pickup_date") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  const err = (msg: string) =>
    redirect("/dashboard/orders/request?error=" + encodeURIComponent(msg));

  if (!title) err("Describe what the payment is for.");
  if (Number.isNaN(priceDollars) || priceDollars <= 0)
    err("Enter the price you agreed on.");
  if (priceDollars > 10000) err("The maximum is $10,000.");

  const fullCents = Math.round(priceDollars * 100);
  // Deposit = half now, rounded up so the balance is never the bigger half.
  const chargeCents =
    chargeKind === "deposit" ? Math.ceil(fullCents / 2) : fullCents;

  const token = randomBytes(16).toString("hex");
  const { error } = await supabase.from("custom_requests").insert({
    cook_id: cook.id,
    token,
    title,
    price_cents: chargeCents,
    full_price_cents: fullCents,
    charge_kind: chargeKind,
    pickup_date: pickupDate || null,
    note: note || null,
  });
  if (error) err("Couldn't create the link — please try again.");

  revalidatePath("/dashboard/orders");
  redirect("/dashboard/orders?created=" + token);
}

// Cancel an unpaid request (kills the link). The guard trigger only permits
// open→cancelled from a cook's session, so nothing else can be touched here.
export async function cancelPaymentRequest(formData: FormData) {
  const supabase = createClient();
  const { user, cook } = await getCurrentCook();
  if (!user) redirect("/login");
  if (!cook) redirect("/dashboard");

  const id = String(formData.get("request_id") ?? "");
  if (id) {
    await supabase
      .from("custom_requests")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("cook_id", cook.id)
      .eq("status", "open");
  }
  revalidatePath("/dashboard/orders");
  redirect("/dashboard/orders");
}
