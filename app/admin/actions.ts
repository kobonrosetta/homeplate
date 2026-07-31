"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCookStatusChange } from "@/lib/cook-notify";

const COOK_STATUSES = new Set(["pending", "active", "paused", "suspended"]);

function bumpAdmin(cookId?: string) {
  revalidatePath("/admin");
  revalidatePath("/browse");
  if (cookId) revalidatePath(`/admin/kitchen/${cookId}`);
}

// Set a kitchen's lifecycle status. The admin service role bypasses the cook
// status trigger, so any transition is allowed (approve pending→active, pause,
// suspend, reactivate suspended→active, send back to review). Decoupled from the
// verified badge — see setVerified.
export async function setCookStatus(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !COOK_STATUSES.has(status)) return;
  const db = createAdminClient();
  // Read the prior state so we can tell a real transition from a no-op re-click
  // and phrase the email correctly (first approval vs reactivation, live vs
  // payouts-pending).
  const { data: before } = await db
    .from("cooks")
    .select("status, business_name, slug, profile_id, stripe_ready")
    .eq("id", id)
    .maybeSingle();
  await db.from("cooks").update({ status }).eq("id", id);
  if (before) {
    await notifyCookStatusChange({
      profileId: before.profile_id,
      businessName: before.business_name,
      slug: before.slug,
      stripeReady: before.stripe_ready === true,
      prevStatus: before.status,
      newStatus: status,
    });
  }
  bumpAdmin(id);
}

// Manually grant / revoke the county-verified trust badge, independent of
// status. (Permit-matched cooks are already verified from signup; this is for
// verifying an unmatched kitchen after a manual check, or pulling a bad badge.)
export async function setVerified(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  if (!id) return;
  const verified = String(formData.get("verified") ?? "") === "1";
  const db = createAdminClient();
  await db.from("cooks").update({ permit_verified: verified }).eq("id", id);
  bumpAdmin(id);
}

// Archive a kitchen: hide it everywhere but keep every record (orders, tax
// history, reviews). This is the safe alternative to deleting a kitchen that has
// orders. Also flips an active/paused kitchen to 'suspended' so buyer surfaces
// (which gate on status='active') stop showing it; archived_at controls the
// admin-list visibility.
export async function archiveCook(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  if (!id) return;
  const db = createAdminClient();
  const { data: cook } = await db
    .from("cooks")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  const patch: { archived_at: string; status?: string } = {
    archived_at: new Date().toISOString(),
  };
  if (cook?.status === "active" || cook?.status === "paused") {
    patch.status = "suspended";
  }
  await db.from("cooks").update(patch).eq("id", id);
  bumpAdmin(id);
}

export async function unarchiveCook(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  if (!id) return;
  const db = createAdminClient();
  await db.from("cooks").update({ archived_at: null }).eq("id", id);
  bumpAdmin(id);
}

// Rename a kitchen (list quick-action; the slug/URL stays the same).
export async function renameCook(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  const name = String(formData.get("business_name") ?? "").trim();
  if (!id || !name) return;
  const db = createAdminClient();
  await db.from("cooks").update({ business_name: name }).eq("id", id);
  bumpAdmin(id);
}

// Edit a kitchen's fields from the detail page. WHITELISTED columns only — slug
// (public URL), money columns, and status/permit_verified (their own actions)
// are deliberately excluded. Only fields present in the submitted form are
// written, so partial forms are safe.
const TEXT_FIELDS = [
  "owner_name",
  "city",
  "zip",
  "bio",
  "neighborhood",
  "delivery_notes",
  "permit_number",
];

export async function updateCookFields(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("cook_id") ?? "");
  if (!id) redirect("/admin");

  const patch: Record<string, unknown> = {};

  // business_name is NOT NULL and the storefront title — only write a non-empty.
  const name = String(formData.get("business_name") ?? "").trim();
  if (formData.has("business_name") && name) patch.business_name = name;

  for (const k of TEXT_FIELDS) {
    if (!formData.has(k)) continue;
    patch[k] = String(formData.get(k) ?? "").trim() || null;
  }

  const op = String(formData.get("operation_type") ?? "");
  if (op === "mehko" || op === "cottage") patch.operation_type = op;

  if (formData.has("cuisine_tags")) {
    const raw = String(formData.get("cuisine_tags") ?? "").trim();
    patch.cuisine_tags = raw
      ? raw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
  }

  // Checkboxes: present in the form always; value present = checked.
  if (formData.has("pickup_delivery_form")) {
    patch.pickup_available = formData.get("pickup_available") != null;
    patch.delivery_available = formData.get("delivery_available") != null;
  }

  if (Object.keys(patch).length > 0) {
    const db = createAdminClient();
    await db.from("cooks").update(patch).eq("id", id);
    revalidatePath(`/admin/kitchen/${id}`);
    revalidatePath("/admin");
    revalidatePath("/browse");
  }
  redirect(`/admin/kitchen/${id}?saved=1`);
}

// Hard-delete a kitchen (cascades listings, cook_private, cook_stripe, payouts,
// follows, custom_requests) — ONLY when it has no orders, so real order history
// is never destroyed. Kitchens WITH orders are archived instead (archiveCook).
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
  if ((count ?? 0) > 0) return; // has orders — protected; archive it instead
  await db.from("cooks").delete().eq("id", id);
  revalidatePath("/admin");
  revalidatePath("/browse");
  redirect("/admin");
}

// ---- Moderation (detail page) ----

export async function deleteReview(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("review_id") ?? "");
  const cookId = String(formData.get("cook_id") ?? "");
  if (!id) return;
  const db = createAdminClient();
  await db.from("reviews").delete().eq("id", id);
  bumpAdmin(cookId || undefined);
}

export async function setListingAvailability(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("listing_id") ?? "");
  const cookId = String(formData.get("cook_id") ?? "");
  if (!id) return;
  const isAvailable = String(formData.get("is_available") ?? "") === "1";
  const db = createAdminClient();
  await db.from("listings").update({ is_available: isAvailable }).eq("id", id);
  bumpAdmin(cookId || undefined);
}

export async function deleteListing(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("listing_id") ?? "");
  const cookId = String(formData.get("cook_id") ?? "");
  if (!id) return;
  const db = createAdminClient();
  await db.from("listings").delete().eq("id", id); // cascades option groups/options
  bumpAdmin(cookId || undefined);
}
