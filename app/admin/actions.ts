"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Approve a kitchen → it goes live and gets the verified badge. The admin's
// approval IS the verification. Admin-gated + service-role (bypasses RLS).
export async function approveCook(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  if (!id) return;
  const db = createAdminClient();
  await db
    .from("cooks")
    .update({ status: "active", permit_verified: true })
    .eq("id", id);
  revalidatePath("/admin");
  revalidatePath("/browse");
}

// Reject / pause a kitchen → hidden from buyers.
export async function rejectCook(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  if (!id) return;
  const db = createAdminClient();
  await db.from("cooks").update({ status: "paused" }).eq("id", id);
  revalidatePath("/admin");
  revalidatePath("/browse");
}

// Rename a kitchen (fix a typo, clean up a name). Slug/URL stays the same.
export async function renameCook(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  const name = String(formData.get("business_name") ?? "").trim();
  if (!id || !name) return;
  const db = createAdminClient();
  await db.from("cooks").update({ business_name: name }).eq("id", id);
  revalidatePath("/admin");
  revalidatePath("/browse");
}

// Hard-delete a kitchen (and its listings) — ONLY if it has no orders, so real
// order history is never orphaned. Use it to clear out test/junk kitchens.
export async function deleteCook(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  if (!id) return;
  const db = createAdminClient();
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("cook_id", id);
  if ((count ?? 0) > 0) return; // has orders — protect it
  await db.from("cooks").delete().eq("id", id); // cascades listings + cook_private
  revalidatePath("/admin");
  revalidatePath("/browse");
}

// Record a manual payout you sent a cook (for the pilot's by-hand payouts).
export async function recordPayout(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  const dollars = parseFloat(String(formData.get("amount") ?? ""));
  const note = String(formData.get("note") ?? "").trim();
  if (!id || Number.isNaN(dollars) || dollars <= 0) return;
  const db = createAdminClient();
  await db.from("payouts").insert({
    cook_id: id,
    amount_cents: Math.round(dollars * 100),
    note: note || null,
  });
  revalidatePath("/admin");
}
