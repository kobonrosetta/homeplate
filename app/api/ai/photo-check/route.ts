import { NextResponse } from "next/server";
import { checkPhotoImage } from "@/lib/ai";
import { MIN_PHOTO_SCORE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

// Grades a photo (sent as a base64 data URL) so the cook gets instant
// feedback before they submit the listing.
export async function POST(request: Request) {
  // Real signed-in users only — these routes spend the Groq key, and
  // anonymous (guest-checkout) sessions are free to mint in bulk.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  // These routes spend the Groq key — cap per-user volume so one signed-in
  // account can't run up the bill in a loop.
  const gate = rateLimit(`ai:${user.id}`, 30, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } }
    );
  }

  // Reject an oversized body before json() buffers it into memory. Content-Length
  // can be omitted (chunked), so the parsed-image cap below is the real backstop.
  if (Number(request.headers.get("content-length") ?? 0) > 8_000_000) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const body = await request.json().catch(() => ({}));
  const image = typeof body.image === "string" ? body.image : "";
  if (!image) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }
  // A legitimate base64 photo is a few hundred KB; past ~4.5MB decoded it's
  // abuse, not a photo.
  if (image.length > 6_000_000) {
    return NextResponse.json({ error: "Image too large." }, { status: 413 });
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
