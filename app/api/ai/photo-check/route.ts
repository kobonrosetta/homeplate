import { NextResponse } from "next/server";
import { checkPhotoImage } from "@/lib/ai";
import { MIN_PHOTO_SCORE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

// Grades a photo (sent as a base64 data URL) so the cook gets instant
// feedback before they submit the listing.
export async function POST(request: Request) {
  // Signed-in users only — these routes spend the Groq key.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const image = typeof body.image === "string" ? body.image : "";
  if (!image) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const result = await checkPhotoImage(image);
  if (!result) {
    // AI unavailable (no key / error) — don't block the cook.
    return NextResponse.json({ score: null, feedback: null, ok: true });
  }

  return NextResponse.json({
    score: result.score,
    feedback: result.feedback,
    ok: result.score >= MIN_PHOTO_SCORE,
    min: MIN_PHOTO_SCORE,
  });
}
