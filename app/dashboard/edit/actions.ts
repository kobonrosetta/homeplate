"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadCookAvatar } from "@/lib/listings";

export async function updateKitchen(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businessName = String(formData.get("business_name") ?? "").trim();
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

  if (!businessName || !city || !streetAddress) {
    redirect(
      "/dashboard/settings?error=" +
        encodeURIComponent(
          "Business name, street address, and city are required."
        )
    );
  }

  await supabase
    .from("cooks")
    .update({
      business_name: businessName,
      operation_type: operationType,
      bio: bio || null,
      city: city || null,
      zip: zip || null,
      cuisine_tags: cuisineTags,
      pickup_available: pickup,
      delivery_available: delivery,
      delivery_notes: deliveryNotes || null,
    })
    .eq("profile_id", user.id);

  // The home address lives in the locked-down private table.
  const { data: cookRow } = await supabase
    .from("cooks")
    .select("id")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();
  if (cookRow) {
    await supabase.from("cook_private").upsert(
      {
        cook_id: cookRow.id,
        street_address: streetAddress || null,
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
  }

  revalidatePath("/", "layout");
  redirect("/dashboard/settings");
}
