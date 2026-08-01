"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";
import {
  insertListingFromForm,
  uploadCookAvatar,
  uploadCookCover,
  uploadPermitPhoto,
  permitFileProblem,
  readPickupWindows,
} from "@/lib/listings";
import { escapeHtml, sendEmail, wrapEmail } from "@/lib/email";
import { normalizePermit, isExpired } from "@/lib/match";
import { captureServer } from "@/lib/analytics-server";

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
  const ownerName = String(formData.get("owner_name") ?? "").trim();
  const operationType = String(formData.get("operation_type") ?? "cottage");
  const bio = String(formData.get("bio") ?? "").trim();
  const cuisineTags = String(formData.get("cuisine_tags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const pickup = formData.get("pickup_available") === "on";
  const delivery = formData.get("delivery_available") === "on";
  const deliveryNotes = String(formData.get("delivery_notes") ?? "").trim();
  const pickupWindows = readPickupWindows(formData);
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();

  if (!businessName || !contactPhone) {
    redirect(
      "/sell?error=" +
        encodeURIComponent("A kitchen name and a contact phone are required.")
    );
  }

  // The contact phone lives on the profile. It's how ForkFork reaches the cook
  // about their application (the permit is now optional, so this is the
  // guaranteed contact channel) and how a buyer reaches them after an order.
  await supabase
    .from("profiles")
    .update({ phone: contactPhone })
    .eq("id", user.id);

  const basics = {
    business_name: businessName,
    owner_name: ownerName || null,
    operation_type: operationType,
    bio: bio || null,
    cuisine_tags: cuisineTags,
    pickup_available: pickup,
    delivery_available: delivery,
    delivery_notes: deliveryNotes || null,
    pickup_windows: pickupWindows,
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
      console.error("wizardSaveKitchen: cook insert failed", lastError);
      redirect(
        "/sell?error=" +
          encodeURIComponent("Couldn't create your kitchen. Please try again.")
      );
    }
    await supabase.from("profiles").update({ is_cook: true }).eq("id", user.id);
    captureServer(user.id, "kitchen_created", { operation_type: operationType });
  }

  // Optional cook photo + storefront cover.
  if (cookId) {
    const avatarUrl = await uploadCookAvatar(supabase, cookId, formData);
    if (avatarUrl) {
      await supabase
        .from("cooks")
        .update({ avatar_url: avatarUrl })
        .eq("id", cookId);
    }
    const coverUrl = await uploadCookCover(supabase, cookId, formData);
    if (coverUrl) {
      await supabase
        .from("cooks")
        .update({ cover_url: coverUrl })
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
  captureServer(user.id, "listing_created", { source: "wizard" });
  revalidatePath("/", "layout");
  redirect("/sell?step=3");
}

// STEP 3 — permit + address; run the county match; land in "under review".
export async function wizardFinalize(formData: FormData) {
  const { supabase, user } = await requireCookUser();
  const cookId = await myCookId(supabase, user.id);
  if (!cookId) redirect("/sell");

  // Finalize is valid ONLY while the kitchen is still under admin review
  // (status='pending'). This action re-derives permit_verified from a
  // cook-supplied permit number and writes it via the service role, which
  // bypasses the cooks update-guard trigger — so it must never be reachable
  // after approval: otherwise an already-active cook could re-POST it with a
  // stranger's real county permit number and self-award the buyer-facing
  // "County-verified" badge with no human review, and a suspended cook could
  // rewrite their permit/address. Any post-review change goes through the admin
  // console only. (The /sell page redirect guards the render; this guards the
  // directly-POST-able action endpoint.)
  const { data: cookState } = await supabase
    .from("cooks")
    .select("status")
    .eq("id", cookId)
    .maybeSingle();
  if (cookState?.status !== "pending") redirect("/dashboard");

  const permitNumber = String(formData.get("permit_number") ?? "").trim();
  const streetAddress = String(formData.get("street_address") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();
  const cdtfaPermit = String(formData.get("cdtfa_permit") ?? "").trim();

  // Permit is now OPTIONAL — a cook can submit and land in pending without one,
  // and admin approval (plus, when given, the permit match/photo) is the gate.
  // Address + city are still required (private; a real operator has them).
  if (!streetAddress || !city) {
    redirect(
      "/sell?step=3&error=" +
        encodeURIComponent("Street address and city are required.")
    );
  }

  // If a permit photo was attached, reject a bad file LOUDLY before writing
  // anything — a silent drop would leave the cook believing it was submitted.
  const permitPhotoFile = formData.get("permit_photo");
  const hasPermitPhoto =
    permitPhotoFile instanceof File && permitPhotoFile.size > 0;
  if (hasPermitPhoto) {
    const bad = permitFileProblem(permitPhotoFile as File);
    if (bad) redirect("/sell?step=3&error=" + encodeURIComponent(bad));
  }

  // Match the permit against the county approved-operator list. The permit is
  // the county-verifiable fact, so the auto-flag keys on a live (non-expired)
  // permit match. The kitchen name is NOT a gate — cooks legitimately brand
  // differently from the name on their permit (a DBA, or a typo on the paper
  // application). The admin console shows the reviewer how the names line up
  // (nameMatchTier) as an advisory signal, and admin approval — plus, when
  // provided, the permit photo below — is the real gate.
  const normalizedPermit = permitNumber ? normalizePermit(permitNumber) : null;
  let match: { id: string; name: string; expires_at: string | null } | null =
    null;
  if (normalizedPermit) {
    const { data } = await supabase
      .from("approved_operators")
      .select("id, name, expires_at")
      .eq("permit_number", normalizedPermit)
      .maybeSingle();
    match = data;
  }

  const today = new Date().toISOString().slice(0, 10);
  const verified = !!match && !isExpired(match.expires_at, today);

  // Optional: a photo of the physical permit — the one piece of evidence the
  // public county list can't provide, so it's what makes the admin's review
  // meaningful against someone copying a stranger's public permit number.
  const permitPhotoPath = await uploadPermitPhoto(supabase, cookId, formData);
  if (hasPermitPhoto && !permitPhotoPath) {
    redirect(
      "/sell?step=3&error=" +
        encodeURIComponent(
          "Your permit photo couldn't be uploaded. Try again with a smaller image, or leave it off for now."
        )
    );
  }

  // A re-submitted photo supersedes the old one — remember it so the orphan
  // can be removed from the private bucket after the new path is saved.
  const { data: oldPriv } = permitPhotoPath
    ? await createAdminClient()
        .from("cook_private")
        .select("permit_photo_path")
        .eq("cook_id", cookId)
        .maybeSingle()
    : { data: null };

  // Permit columns are protected from end-user sessions (see
  // supabase/harden-cooks.sql), so this write goes through the service
  // role. cookId is always the signed-in user's own kitchen (myCookId).
  await createAdminClient()
    .from("cooks")
    .update({
      permit_number: normalizedPermit,
      permit_verified: verified,
      approved_operator_id: match?.id ?? null,
      city: city || null,
      zip: zip || null,
    })
    .eq("id", cookId);

  // Home address (and the private permit photo path + CDTFA seller's-permit
  // number) live in the locked-down owner-only table. The CDTFA field is
  // optional — an empty resubmit must not clobber a previously saved number.
  await supabase.from("cook_private").upsert(
    {
      cook_id: cookId,
      street_address: streetAddress,
      ...(permitPhotoPath ? { permit_photo_path: permitPhotoPath } : {}),
      ...(cdtfaPermit ? { cdtfa_permit: cdtfaPermit } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cook_id" }
  );

  // Best-effort: clear the superseded photo (never the one just saved).
  const oldPath = oldPriv?.permit_photo_path;
  if (permitPhotoPath && oldPath && oldPath !== permitPhotoPath) {
    try {
      await createAdminClient().storage.from("permits").remove([oldPath]);
    } catch {
      /* orphan is harmless; the new path is what's on file */
    }
  }

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
          cook?.business_name ? `: ${cook.business_name}` : ""
        }`,
        html: wrapEmail(
          `<h2>A kitchen is waiting for approval</h2>
           <p><strong>${escapeHtml(cook?.business_name ?? "A kitchen")}</strong> ${
             normalizedPermit
               ? `submitted permit ${escapeHtml(normalizedPermit)} ${
                   verified
                     ? "(matched the county list)"
                     : match
                       ? `(matched the county list but the permit EXPIRED ${escapeHtml(
                           String(match.expires_at)
                         )})`
                       : "(no county match)"
                 }`
               : "submitted with NO permit number; follow up before approving"
           }.</p>
           <p>Review it in the admin console.</p>`
        ),
      });
    }
  } catch {
    /* ignore */
  }

  captureServer(user.id, "kitchen_submitted", {
    has_permit: Boolean(normalizedPermit),
    verified: Boolean(verified),
  });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
