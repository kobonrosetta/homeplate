import { checkPhotoImage } from "@/lib/ai";
import { MIN_PHOTO_SCORE } from "@/lib/constants";
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
  const leadTime = String(formData.get("lead_time_note") ?? "").trim();
  const allergens = String(formData.get("allergens") ?? "").trim();

  if (!title || Number.isNaN(priceDollars) || priceDollars <= 0) {
    return "A title and a price above $0 are required.";
  }
  if (priceDollars > 10000) {
    return "That price looks too high — the maximum is $10,000.";
  }

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
    const chk = await checkPhotoImage(eurl);
    if (chk && chk.score < MIN_PHOTO_SCORE) {
      await storage.from("listing-photos").remove([path]);
      continue;
    }
    extraUrls.push(eurl);
  }

  const { error } = await supabase.from("listings").insert({
    cook_id: cookId,
    title,
    category,
    price_cents: Math.round(priceDollars * 100),
    description: description || null,
    allergens: allergens || null,
    quantity_available: quantity,
    limited_quantity: limited,
    lead_time_note: leadTime || null,
    photo_url: photoUrl,
    photo_urls: extraUrls,
    photo_quality_score: qualityScore,
    is_available: true,
  });
  return error ? error.message : null;
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
