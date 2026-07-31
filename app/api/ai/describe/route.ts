import { NextResponse } from "next/server";
import { generateDescription } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

// Writes a listing description. If an image (base64 data URL) is included,
// the description is grounded in what the photo actually shows.
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

  // Shared per-user AI budget with the photo-check route — spends the Groq key.
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
  const title = String(body.title ?? "").trim().slice(0, 200);
  const category = String(body.category ?? "other").slice(0, 60);
  const image =
    typeof body.image === "string" && body.image.length > 0 ? body.image : null;
  if (image && image.length > 6_000_000) {
    return NextResponse.json({ error: "Image too large." }, { status: 413 });
  }

  if (!title && !image) {
    return NextResponse.json(
      { error: "Add an item name or a photo first." },
      { status: 400 }
    );
  }

  const description = await generateDescription(title, category, image);
  if (!description) {
    return NextResponse.json(
      { error: "AI is unavailable. Add your GROQ_API_KEY to enable it." },
      { status: 503 }
    );
  }

  return NextResponse.json({ description, usedPhoto: Boolean(image) });
}
