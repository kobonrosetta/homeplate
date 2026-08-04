import { checkPhotoImage } from "@/lib/ai";
import { MIN_PHOTO_SCORE } from "@/lib/constants";
import { readAllergensFromForm, allergenColumns } from "@/lib/allergens";
import {
  readAvailabilityFromForm,
  validateAvailability,
  pacificTodayIso,
} from "@/lib/availability";
import { createAdminClient } from "@/lib/supabase/admin";

// All storage writes go through the service role (this module is imported by
// server actions only). The caller has already been authenticated and every
// path is built from the caller's OWN cook id — never from form input — so
// ownership is enforced here in code; the bucket RLS policies remain as
// defense-in-depth. This also decouples uploads from Storage-side user-JWT
// verification (broken for ES256-signed sessions as of Jul 2026).
function adminStorage() {
  return createAdminClient().storage;
}

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
// Buyer-facing photos must render in every browser, so no HEIC above (Safari
// converts iPhone HEIC to JPEG on upload; a raw .heic would show broken for
// most buyers and slip past the AI food gate unscored). Permit photos are
// admin-only viewing, so HEIC/PDF are fine there.
const PERMIT_FILE_TYPES = new Set([
  ...IMAGE_TYPES,
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const MAX_PHOTO_MB = 8;
const MAX_PERMIT_MB = 10;

// Returns an error string, or null if the file is an acceptable public photo.
// An EMPTY type is allowed (some browsers omit the MIME type; the upload falls
// back to image/jpeg) — only a wrong declared type is rejected.
function photoProblem(file: File): string | null {
  if (file.type && !IMAGE_TYPES.has(file.type)) {
    return "Photos must be a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
    return `Photos must be under ${MAX_PHOTO_MB}MB.`;
  }
  return null;
}

// Same idea for the (optional) permit photo — exported so the wizard can
// reject a bad file LOUDLY before writing anything, instead of silently
// dropping it while the cook believes it was submitted.
export function permitFileProblem(file: File): string | null {
  if (file.type && !PERMIT_FILE_TYPES.has(file.type)) {
    return "The permit photo must be an image (JPEG, PNG, WebP, HEIC) or a PDF.";
  }
  if (file.size > MAX_PERMIT_MB * 1024 * 1024) {
    return `The permit photo must be under ${MAX_PERMIT_MB}MB.`;
  }
  return null;
}

// "Made to order" stores 0 and ignores it; "Set a number" stores the count.
export function readQuantity(formData: FormData): {
  limited: boolean;
  quantity: number;
} {
  const limited = String(formData.get("limited_quantity") ?? "false") === "true";
  const raw = parseInt(String(formData.get("quantity_available") ?? "0"), 10);
  const quantity = limited ? (Number.isNaN(raw) ? 0 : Math.max(0, raw)) : 0;
  return { limited, quantity };
}

// Cook-defined pickup windows: one per line, each trimmed + capped at 80 chars,
// max 10, blanks dropped — so a paste-happy cook can't blow up checkout. Shared
// by the sell wizard and dashboard settings (both write cooks.pickup_windows).
export function readPickupWindows(formData: FormData): string[] {
  return String(formData.get("pickup_windows") ?? "")
    .split("\n")
    .map((s) => s.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 10);
}

// Create a listing for `cookId` from a submitted form (photo upload + the
// authoritative AI quality gate). Returns an error message, or null on success.
// No redirects — the caller (dashboard OR onboarding wizard) decides where to go.
export async function insertListingFromForm(
  supabase: any,
  cookId: string,
  formData: FormData
): Promise<string | null> {
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "other");
  const priceDollars = parseFloat(String(formData.get("price") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const { limited, quantity } = readQuantity(formData);
  const allergens = String(formData.get("allergens") ?? "").trim();
  const ingredients = String(formData.get("ingredients") ?? "").trim();
  const { contains, mayContain, declared } = readAllergensFromForm(formData);
  // Extras (packaging, lettering, upgrades) aren't food — they skip the AI
  // food-photo gate below and render in their own strip on the kitchen page.
  const kind = formData.get("kind") === "extra" ? "extra" : "dish";

  // CA taxability flag ("How is it served?"). Server-derived guard, never
  // trusted from the form alone: only MEHKO kitchens can flag hot food
  // (cottage-food law covers only shelf-stable items), and extras are never
  // food. Cottage listings therefore always store false.
  const { data: cookRow } = await supabase
    .from("cooks")
    .select("operation_type")
    .eq("id", cookId)
    .maybeSingle();
  const servedHot =
    kind === "dish" &&
    cookRow?.operation_type === "mehko" &&
    String(formData.get("served_hot") ?? "") === "true";

  if (!title || Number.isNaN(priceDollars) || priceDollars <= 0) {
    return "A title and a price above $0 are required.";
  }
  if (priceDollars > 10000) {
    return "That price looks too high — the maximum is $10,000.";
  }
  // Force an affirmative allergen answer on food, so a blank can never pass as
  // "allergen-free". Extras aren't food and have no allergen step.
  if (kind === "dish" && !declared) {
    return "Please confirm this dish's allergens before saving (check the box under Allergens, or confirm it has none).";
  }

  // Availability: parse the timing fields and validate them server-side (the
  // authoritative gate — the form also constrains inputs). Extras store ready_now.
  const availability = readAvailabilityFromForm(formData, kind);
  const availErr = validateAvailability(
    {
      mode: availability.fulfillment_mode,
      leadDays: availability.lead_days,
      readyDate: availability.ready_date,
      orderBy: availability.order_by,
    },
    pacificTodayIso()
  );
  if (availErr) return availErr;

  const storage = adminStorage();

  let photoUrl: string | null = null;
  let qualityScore: number | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const bad = photoProblem(photo);
    if (bad) return bad;
    const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${cookId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await storage
      .from("listing-photos")
      .upload(path, photo, {
        contentType: photo.type || "image/jpeg",
        upsert: false,
      });
    if (!uploadError) {
      const { data: pub } = storage.from("listing-photos").getPublicUrl(path);
      const url: string = pub.publicUrl;
      photoUrl = url;

      // The food-quality gate only makes sense for food.
      if (kind === "dish") {
        const check = await checkPhotoImage(url);
        qualityScore = check?.score ?? null;
        if (qualityScore !== null && qualityScore < MIN_PHOTO_SCORE) {
          await storage.from("listing-photos").remove([path]);
          return `Photo scored ${qualityScore}/100${
            check?.feedback ? ` — ${check.feedback}` : ""
          }. Please upload a clear photo of the actual food.`;
        }
      }
    }
  }

  // Additional photos (optional) — gate each; keep the ones that pass.
  const extraUrls: string[] = [];
  for (const p of formData.getAll("photos").slice(0, 4)) {
    if (!(p instanceof File) || p.size === 0 || photoProblem(p)) continue;
    const ext = (p.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${cookId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await storage
      .from("listing-photos")
      .upload(path, p, { contentType: p.type || "image/jpeg", upsert: false });
    if (upErr) continue;
    const eurl: string = storage.from("listing-photos").getPublicUrl(path).data
      .publicUrl;
    if (kind === "dish") {
      const chk = await checkPhotoImage(eurl);
      if (chk && chk.score < MIN_PHOTO_SCORE) {
        await storage.from("listing-photos").remove([path]);
        continue;
      }
    }
    extraUrls.push(eurl);
  }

  const { error } = await supabase.from("listings").insert({
    cook_id: cookId,
    title,
    category,
    kind,
    served_hot: servedHot,
    price_cents: Math.round(priceDollars * 100),
    description: description || null,
    allergens: allergens || null,
    ...allergenColumns(kind, { contains, mayContain, declared }),
    ...availability,
    ingredients: ingredients || null,
    quantity_available: quantity,
    limited_quantity: limited,
    photo_url: photoUrl,
    photo_urls: extraUrls,
    photo_quality_score: qualityScore,
    is_available: true,
  });

  // Follower alerts are no longer sent inline. A new dish is created with
  // announced_at = null (default) and the announce-dishes cron sweeps a
  // posting session's dishes into ONE digest — so the 2nd–Nth dish of a
  // session isn't lost the way the old 6h cooldown dropped them.
  return error ? error.message : null;
}

// Upload a replacement/main DISH photo through the service role (path derived
// from the caller's own cook id), validating MIME/size and running the AI food
// gate — the same treatment insertListingFromForm gives a new dish's photo, so
// the create and edit paths can't drift. Returns { url, score } on success,
// { error } for a bad file / rejected photo, or null when no file was provided.
export async function uploadDishPhoto(
  cookId: string,
  file: unknown
): Promise<{ url: string; score: number | null } | { error: string } | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  const bad = photoProblem(file);
  if (bad) return { error: bad };
  const storage = adminStorage();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${cookId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await storage
    .from("listing-photos")
    .upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  if (uploadError) {
    return { error: "Couldn't upload the photo — please try again." };
  }
  const url = storage.from("listing-photos").getPublicUrl(path).data.publicUrl;
  const check = await checkPhotoImage(url);
  const score = check?.score ?? null;
  if (score !== null && score < MIN_PHOTO_SCORE) {
    await storage.from("listing-photos").remove([path]);
    return {
      error: `Photo scored ${score}/100${
        check?.feedback ? ` — ${check.feedback}` : ""
      }. Please upload a clear photo of the actual food.`,
    };
  }
  return { url, score };
}

// Upload a cook's profile photo (no food quality gate — it's a face, not a dish).
// Returns the public URL, or null if no/invalid file was provided or the
// upload failed. (`supabase` is unused but kept so call sites read uniformly.)
export async function uploadCookAvatar(
  supabase: any,
  cookId: string,
  formData: FormData
): Promise<string | null> {
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0 || photoProblem(file)) {
    return null;
  }
  const storage = adminStorage();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${cookId}/avatar-${crypto.randomUUID()}.${ext}`;
  const { error } = await storage.from("listing-photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) return null;
  return storage.from("listing-photos").getPublicUrl(path).data.publicUrl;
}

// Upload a cook's storefront cover photo — the wide banner across the top of
// their kitchen page. Same public bucket + validation as the avatar, no food
// quality gate (it's a vibe shot — kitchen, table, a spread — not a single
// dish to score). Returns the public URL, or null if no/invalid file.
export async function uploadCookCover(
  supabase: any,
  cookId: string,
  formData: FormData
): Promise<string | null> {
  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0 || photoProblem(file)) {
    return null;
  }
  const storage = adminStorage();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${cookId}/cover-${crypto.randomUUID()}.${ext}`;
  const { error } = await storage.from("listing-photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) return null;
  return storage.from("listing-photos").getPublicUrl(path).data.publicUrl;
}

// Upload an (optional) photo of the cook's physical permit. Goes to the PRIVATE
// "permits" bucket — it shows the holder's name/address, so it must never be
// publicly readable. Returns the storage PATH (admins view it via a short-lived
// signed URL), or null if no/invalid file was provided or the upload failed.
export async function uploadPermitPhoto(
  supabase: any,
  cookId: string,
  formData: FormData
): Promise<string | null> {
  const file = formData.get("permit_photo");
  if (!(file instanceof File) || file.size === 0) return null;
  if (permitFileProblem(file)) return null; // wizard pre-checks this loudly
  const ext =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${cookId}/permit-${crypto.randomUUID()}.${ext}`;
  const { error } = await adminStorage()
    .from("permits")
    .upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
  if (error) return null;
  return path;
}
