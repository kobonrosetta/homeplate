"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkPhotoImage } from "@/lib/ai";
import { MIN_PHOTO_SCORE } from "@/lib/constants";
import { insertListingFromForm, readQuantity } from "@/lib/listings";

// Make sure the caller is a logged-in cook, and return their kitchen.
async function requireCook() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cooks } = await supabase
    .from("cooks")
    .select("id")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const cook = cooks?.[0];
  if (!cook) redirect("/sell");

  return { supabase, cook };
}

export async function createListing(formData: FormData) {
  const { supabase, cook } = await requireCook();
  const err = await insertListingFromForm(supabase, cook.id, formData);
  if (err) {
    redirect("/dashboard/listings/new?error=" + encodeURIComponent(err));
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/menu");
}

export async function updateListing(formData: FormData) {
  const { supabase, cook } = await requireCook();
  const id = String(formData.get("id"));

  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "other");
  const priceDollars = parseFloat(String(formData.get("price") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const { limited, quantity } = readQuantity(formData);
  const leadTime = String(formData.get("lead_time_note") ?? "").trim();
  const allergens = String(formData.get("allergens") ?? "").trim();

  if (!title || Number.isNaN(priceDollars)) {
    redirect(
      `/dashboard/listings/${id}/edit?error=` +
        encodeURIComponent("A title and a valid price are required.")
    );
  }

  const update: Record<string, unknown> = {
    title,
    category,
    price_cents: Math.round(priceDollars * 100),
    description: description || null,
    quantity_available: quantity,
    limited_quantity: limited,
    lead_time_note: leadTime || null,
    allergens: allergens || null,
  };

  // Optional new photo — same AI quality gate as creating.
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${cook.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("listing-photos")
      .upload(path, photo, { contentType: photo.type || "image/jpeg", upsert: false });
    if (!uploadError) {
      const { data: pub } = supabase.storage
        .from("listing-photos")
        .getPublicUrl(path);
      const photoUrl = pub.publicUrl;
      const check = await checkPhotoImage(photoUrl);
      const score = check?.score ?? null;
      if (score !== null && score < MIN_PHOTO_SCORE) {
        await supabase.storage.from("listing-photos").remove([path]);
        redirect(
          `/dashboard/listings/${id}/edit?error=` +
            encodeURIComponent(
              `Photo scored ${score}/100${
                check?.feedback ? ` — ${check.feedback}` : ""
              }. Please upload a clear photo of the actual food.`
            )
        );
      }
      update.photo_url = photoUrl;
      update.photo_quality_score = score;
    }
  }

  await supabase.from("listings").update(update).eq("id", id).eq("cook_id", cook.id);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/menu");
}

export async function toggleListing(formData: FormData) {
  const { supabase, cook } = await requireCook();
  const id = String(formData.get("id"));
  const next = String(formData.get("next")) === "true";
  await supabase
    .from("listings")
    .update({ is_available: next })
    .eq("id", id)
    .eq("cook_id", cook.id);
  revalidatePath("/dashboard", "layout");
}

export async function deleteListing(formData: FormData) {
  const { supabase, cook } = await requireCook();
  const id = String(formData.get("id"));
  await supabase.from("listings").delete().eq("id", id).eq("cook_id", cook.id);
  revalidatePath("/dashboard", "layout");
}
