"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function submitReview(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orderId = String(formData.get("order_id") ?? "");
  const rating = parseInt(String(formData.get("rating") ?? "0"), 10);
  const comment = String(formData.get("comment") ?? "").trim();
  if (!orderId || !(rating >= 1 && rating <= 5)) return;

  // Only the buyer of a COMPLETED order may review it.
  const { data: order } = await supabase
    .from("orders")
    .select("id, buyer_id, cook_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.buyer_id !== user.id || order.status !== "completed") return;

  // One review per order.
  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("order_id", orderId)
    .limit(1);
  if (existing && existing.length > 0) return;

  await supabase.from("reviews").insert({
    order_id: orderId,
    buyer_id: user.id,
    cook_id: order.cook_id,
    rating,
    comment: comment || null,
  });
  revalidatePath("/orders");
}
