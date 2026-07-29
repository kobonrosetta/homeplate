"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkPhotoImage } from "@/lib/ai";
import { MIN_PHOTO_SCORE } from "@/lib/constants";
import { insertListingFromForm, readQuantity } from "@/lib/listings";
import { MAX_GROUPS_PER_LISTING, MAX_OPTIONS_PER_GROUP } from "@/lib/options";

// Make sure the caller is a logged-in cook, and return their kitchen.
async function requireCook() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cooks } = await supabase
    .from("cooks")
    .select("id, operation_type")
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
  const ingredients = String(formData.get("ingredients") ?? "").trim();

  if (!title || Number.isNaN(priceDollars) || priceDollars <= 0) {
    redirect(
      `/dashboard/listings/${id}/edit?error=` +
        encodeURIComponent("A title and a price above $0 are required.")
    );
  }
  if (priceDollars > 10000) {
    redirect(
      `/dashboard/listings/${id}/edit?error=` +
        encodeURIComponent("That price looks too high — the maximum is $10,000.")
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
    ingredients: ingredients || null,
    // CA taxability flag — same server-side guard as inserts: only MEHKO
    // kitchens can flag hot food, and the form sends false for extras.
    served_hot:
      cook.operation_type === "mehko" &&
      String(formData.get("served_hot") ?? "") === "true",
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

// Replace a listing's option dropdowns wholesale. Ownership is checked here
// AND enforced by RLS on both option tables (listing -> cook -> profile chain).
export async function saveListingOptions(formData: FormData) {
  const { supabase, cook } = await requireCook();
  const listingId = String(formData.get("listing_id") ?? "");

  const { data: owned } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("cook_id", cook.id)
    .maybeSingle();
  if (!owned) redirect("/dashboard/menu");

  type DraftGroup = { name: string; options: { name: string; priceDelta: string }[] };
  let drafts: DraftGroup[] = [];
  try {
    drafts = JSON.parse(String(formData.get("groups") ?? "[]"));
  } catch {
    drafts = [];
  }

  const backTo = `/dashboard/listings/${listingId}/edit`;
  const err = (msg: string) =>
    redirect(`${backTo}?error=${encodeURIComponent(msg)}`);

  // Normalize + validate before touching anything.
  const cleaned = drafts
    .map((g) => ({
      name: String(g.name ?? "").trim(),
      options: (g.options ?? [])
        .map((o) => ({
          name: String(o.name ?? "").trim(),
          deltaCents: Math.round(parseFloat(String(o.priceDelta ?? "0") || "0") * 100),
        }))
        .filter((o) => o.name),
    }))
    .filter((g) => g.name || g.options.length);
  if (cleaned.length > MAX_GROUPS_PER_LISTING)
    err(`At most ${MAX_GROUPS_PER_LISTING} dropdowns per item.`);
  for (const g of cleaned) {
    if (!g.name) err("Every dropdown needs a name.");
    if (g.options.length === 0) err(`"${g.name}" needs at least one choice.`);
    if (g.options.length > MAX_OPTIONS_PER_GROUP)
      err(`"${g.name}" has too many choices (max ${MAX_OPTIONS_PER_GROUP}).`);
    for (const o of g.options) {
      if (Number.isNaN(o.deltaCents) || o.deltaCents < 0)
        err(`"${o.name}" has an invalid price.`);
      if (o.deltaCents > 1000000) err(`"${o.name}" price is too high.`);
    }
  }

  // Replace-all: delete old groups (options cascade), insert the new set.
  const { error: delErr } = await supabase
    .from("listing_option_groups")
    .delete()
    .eq("listing_id", listingId);
  if (delErr) err("Couldn't save options — please try again.");

  for (let gi = 0; gi < cleaned.length; gi++) {
    const g = cleaned[gi];
    const { data: group, error: gErr } = await supabase
      .from("listing_option_groups")
      .insert({ listing_id: listingId, name: g.name, sort_order: gi })
      .select("id")
      .single();
    if (gErr || !group) err("Couldn't save options — please try again.");
    const { error: oErr } = await supabase.from("listing_options").insert(
      g.options.map((o, oi) => ({
        group_id: group!.id,
        name: o.name,
        price_delta_cents: o.deltaCents,
        sort_order: oi,
      }))
    );
    if (oErr) err("Couldn't save options — please try again.");
  }

  revalidatePath("/dashboard", "layout");
  redirect(backTo + "?saved=options");
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
  const { error } = await supabase
    .from("listings")
    .delete()
    .eq("id", id)
    .eq("cook_id", cook.id);
  if (error) {
    redirect(
      "/dashboard/menu?error=" +
        encodeURIComponent(`Couldn't delete this listing: ${error.message}`)
    );
  }
  revalidatePath("/dashboard", "layout");
}
