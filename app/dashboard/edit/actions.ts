"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  uploadCookAvatar,
  uploadCookCover,
  readPickupWindows,
} from "@/lib/listings";

export async function updateKitchen(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businessName = String(formData.get("business_name") ?? "").trim();
  const ownerName = String(formData.get("owner_name") ?? "").trim();
  const operationType = String(formData.get("operation_type") ?? "cottage");
  const bio = String(formData.get("bio") ?? "").trim();
  const streetAddress = String(formData.get("street_address") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();
  const cuisineTags = String(formData.get("cuisine_tags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const pickup = formData.get("pickup_available") === "on";
  const delivery = formData.get("delivery_available") === "on";
  const deliveryNotes = String(formData.get("delivery_notes") ?? "").trim();
  const pickupWindows = readPickupWindows(formData);
  const cdtfaPermit = String(formData.get("cdtfa_permit") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const neighborhood = String(formData.get("neighborhood") ?? "").trim();
  // "elsewhere" requires a spot — otherwise there'd be silently no pickup
  // location while the cook believes they've picked a meetup point.
  const pickupMode = String(formData.get("pickup_mode") ?? "home");
  const pickupLocation = String(formData.get("pickup_location") ?? "").trim();
  // Kitchen-level default timing that new dishes inherit. Only ready_now /
  // lead_time make sense as a default (a preorder date is inherently per-dish).
  const defaultModeRaw = String(formData.get("default_fulfillment_mode") ?? "ready_now");
  const defaultMode = defaultModeRaw === "lead_time" ? "lead_time" : "ready_now";
  const defaultLeadRaw = parseInt(String(formData.get("default_lead_days") ?? ""), 10);
  const defaultLeadDays = Number.isFinite(defaultLeadRaw)
    ? Math.max(0, Math.min(14, defaultLeadRaw))
    : null;

  if (!businessName || !city || !streetAddress) {
    redirect(
      "/dashboard/settings?error=" +
        encodeURIComponent(
          "Business name, street address, and city are required."
        )
    );
  }
  if (pickupMode === "elsewhere" && !pickupLocation) {
    redirect(
      "/dashboard/settings?error=" +
        encodeURIComponent(
          "Enter where buyers should meet you, or choose your home address."
        )
    );
  }

  await supabase
    .from("cooks")
    .update({
      business_name: businessName,
      owner_name: ownerName || null,
      operation_type: operationType,
      bio: bio || null,
      city: city || null,
      zip: zip || null,
      cuisine_tags: cuisineTags,
      pickup_available: pickup,
      delivery_available: delivery,
      delivery_notes: deliveryNotes || null,
      pickup_windows: pickupWindows,
      neighborhood: neighborhood || null,
      default_fulfillment_mode: defaultMode,
      default_lead_days: defaultLeadDays,
    })
    .eq("profile_id", user.id);

  // The kitchen's buyer-facing contact phone lives on the profile.
  await supabase
    .from("profiles")
    .update({ phone: contactPhone || null })
    .eq("id", user.id);

  // The home address lives in the locked-down private table.
  const { data: cookRow } = await supabase
    .from("cooks")
    .select("id")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();
  if (cookRow) {
    // cdtfa_permit only appears in the form for MEHKO kitchens; the empty-safe
    // spread means a cottage cook's submit (no field) never nulls a saved
    // value. pickup_location is written directly (not empty-safe) — "home"
    // mode must be able to CLEAR a previously saved meetup spot.
    await supabase.from("cook_private").upsert(
      {
        cook_id: cookRow.id,
        street_address: streetAddress || null,
        pickup_location: pickupMode === "elsewhere" ? pickupLocation : null,
        ...(cdtfaPermit ? { cdtfa_permit: cdtfaPermit } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cook_id" }
    );
    const avatarUrl = await uploadCookAvatar(supabase, cookRow.id, formData);
    if (avatarUrl) {
      await supabase
        .from("cooks")
        .update({ avatar_url: avatarUrl })
        .eq("id", cookRow.id);
    }
    const coverUrl = await uploadCookCover(supabase, cookRow.id, formData);
    if (coverUrl) {
      await supabase
        .from("cooks")
        .update({ cover_url: coverUrl })
        .eq("id", cookRow.id);
    }
  }

  revalidatePath("/", "layout");
  redirect("/dashboard/settings");
}
