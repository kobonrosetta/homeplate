"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";
import { insertListingFromForm, uploadCookAvatar } from "@/lib/listings";
import { sendEmail, wrapEmail } from "@/lib/email";

async function requireCookUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.is_anonymous) redirect("/signup");
  return { supabase, user };
}

async function myCookId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("cooks")
    .select("id")
    .eq("profile_id", userId)
    .limit(1);
  return data?.[0]?.id ?? null;
}

// STEP 1 — create (or update) the kitchen basics. No permit/address yet, so the
// cook is committed and productive before we ask for the hard stuff.
export async function wizardSaveKitchen(formData: FormData) {
  const { supabase, user } = await requireCookUser();

  const businessName = String(formData.get("business_name") ?? "").trim();
  const operationType = String(formData.get("operation_type") ?? "cottage");
  const bio = String(formData.get("bio") ?? "").trim();
  const cuisineTags = String(formData.get("cuisine_tags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const pickup = formData.get("pickup_available") === "on";
  const delivery = formData.get("delivery_available") === "on";
  const deliveryNotes = String(formData.get("delivery_notes") ?? "").trim();

  if (!businessName) {
    redirect("/sell?error=" + encodeURIComponent("Please name your kitchen."));
  }

  const basics = {
    business_name: businessName,
    operation_type: operationType,
    bio: bio || null,
    cuisine_tags: cuisineTags,
    pickup_available: pickup,
    delivery_available: delivery,
    delivery_notes: deliveryNotes || null,
  };

  const existingId = await myCookId(supabase, user.id);
  let cookId: string | null = existingId;
  if (existingId) {
    await supabase.from("cooks").update(basics).eq("id", existingId);
  } else {
    // New kitchen: pending, no permit yet. Retry with a random slug suffix on
    // a URL-slug collision.
    const baseSlug = slugify(businessName);
    let lastError: { code?: string; message: string } | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug =
        attempt === 0
          ? baseSlug
          : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: inserted, error } = await supabase
        .from("cooks")
        .insert({
          ...basics,
          profile_id: user.id,
          slug,
          permit_verified: false,
          status: "pending",
        })
        .select("id")
        .single();
      if (!error && inserted) {
        cookId = inserted.id;
        lastError = null;
        break;
      }
      lastError = error;
      if (!(error?.code === "23505" && /slug/i.test(error.message))) break;
    }
    if (lastError || !cookId) {
      redirect(
        "/sell?error=" +
          encodeURIComponent(
            lastError?.message ?? "Could not create your kitchen."
          )
      );
    }
    await supabase.from("profiles").update({ is_cook: true }).eq("id", user.id);
  }

  // Optional cook photo.
  if (cookId) {
    const avatarUrl = await uploadCookAvatar(supabase, cookId, formData);
    if (avatarUrl) {
      await supabase
        .from("cooks")
        .update({ avatar_url: avatarUrl })
        .eq("id", cookId);
    }
  }

  revalidatePath("/", "layout");
  redirect("/sell?step=2");
}

// STEP 2 — add the first dish (same photo gate as the dashboard).
export async function wizardAddDish(formData: FormData) {
  const { supabase, user } = await requireCookUser();
  const cookId = await myCookId(supabase, user.id);
  if (!cookId) redirect("/sell");

  const err = await insertListingFromForm(supabase, cookId!, formData);
  if (err) redirect("/sell?step=2&error=" + encodeURIComponent(err));
  revalidatePath("/", "layout");
  redirect("/sell?step=3");
}

// STEP 3 — permit + address; run the county match; land in "under review".
export async function wizardFinalize(formData: FormData) {
  const { supabase, user } = await requireCookUser();
  const cookId = await myCookId(supabase, user.id);
  if (!cookId) redirect("/sell");

  const permitNumber = String(formData.get("permit_number") ?? "").trim();
  const streetAddress = String(formData.get("street_address") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();

  if (!permitNumber || !streetAddress || !city) {
    redirect(
      "/sell?step=3&error=" +
        encodeURIComponent(
          "Permit number, street address, and city are required."
        )
    );
  }

  // Match the permit against the county approved-operator list (a signal for
  // the admin; the kitchen still waits for approval either way).
  const { data: match } = await supabase
    .from("approved_operators")
    .select("id")
    .ilike("permit_number", permitNumber)
    .maybeSingle();

  // Permit columns are protected from end-user sessions (see
  // supabase/harden-cooks.sql), so this write goes through the service
  // role. cookId is always the signed-in user's own kitchen (myCookId).
  await createAdminClient()
    .from("cooks")
    .update({
      permit_number: permitNumber,
      permit_verified: Boolean(match),
      approved_operator_id: match?.id ?? null,
      city: city || null,
      zip: zip || null,
    })
    .eq("id", cookId);

  // Home address lives in the locked-down private table.
  await supabase.from("cook_private").upsert(
    {
      cook_id: cookId,
      street_address: streetAddress,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cook_id" }
  );

  // Best-effort: tell the admins a kitchen is waiting for review.
  try {
    const admins = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (admins.length) {
      const { data: cook } = await supabase
        .from("cooks")
        .select("business_name")
        .eq("id", cookId)
        .maybeSingle();
      await sendEmail({
        to: admins,
        subject: `New kitchen pending review${
          cook?.business_name ? ` — ${cook.business_name}` : ""
        }`,
        html: wrapEmail(
          `<h2>A kitchen is waiting for approval</h2>
           <p><strong>${cook?.business_name ?? "A kitchen"}</strong> submitted permit ${permitNumber} ${
             match ? "(matched the county list)" : "(no county match)"
           }.</p>
           <p>Review it in the admin console.</p>`
        ),
      });
    }
  } catch {
    /* ignore */
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
