import { NextResponse } from "next/server";
import { generateDescription } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";

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

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const category = String(body.category ?? "other");
  const image =
    typeof body.image === "string" && body.image.length > 0 ? body.image : null;

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
