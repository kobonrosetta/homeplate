import { checkPhotoImage } from "@/lib/ai";
import { MIN_PHOTO_SCORE } from "@/lib/constants";

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

  if (!title || Number.isNaN(priceDollars)) {
    return "A title and a valid price are required.";
  }

  let photoUrl: string | null = null;
  let qualityScore: number | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${cookId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("listing-photos")
      .upload(path, photo, {
        contentType: photo.type || "image/jpeg",
        upsert: false,
      });
    if (!uploadError) {
      const { data: pub } = supabase.storage
        .from("listing-photos")
        .getPublicUrl(path);
      const url: string = pub.publicUrl;
      photoUrl = url;

      const check = await checkPhotoImage(url);
      qualityScore = check?.score ?? null;
      if (qualityScore !== null && qualityScore < MIN_PHOTO_SCORE) {
        await supabase.storage.from("listing-photos").remove([path]);
        return `Photo scored ${qualityScore}/100${
          check?.feedback ? ` — ${check.feedback}` : ""
        }. Please upload a clear photo of the actual food.`;
      }
    }
  }

  // Additional photos (optional) — gate each; keep the ones that pass.
  const extraUrls: string[] = [];
  for (const p of formData.getAll("photos").slice(0, 4)) {
    if (!(p instanceof File) || p.size === 0) continue;
    const ext = (p.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${cookId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("listing-photos")
      .upload(path, p, { contentType: p.type || "image/jpeg", upsert: false });
    if (upErr) continue;
    const eurl: string = supabase.storage
      .from("listing-photos")
      .getPublicUrl(path).data.publicUrl;
    const chk = await checkPhotoImage(eurl);
    if (chk && chk.score < MIN_PHOTO_SCORE) {
      await supabase.storage.from("listing-photos").remove([path]);
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
// Returns the public URL, or null if no file was provided / upload failed.
export async function uploadCookAvatar(
  supabase: any,
  cookId: string,
  formData: FormData
): Promise<string | null> {
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return null;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${cookId}/avatar-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("listing-photos")
    .upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  if (error) return null;
  return supabase.storage.from("listing-photos").getPublicUrl(path).data
    .publicUrl;
}
