import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Follow/unfollow without a page re-render. The order-confirmation page uses
// this instead of a server-action form because invoking a server action
// re-renders the invoking page — and that page's render re-verifies the
// Stripe session, so a transient Stripe failure would replace "Order
// confirmed" with the couldn't-verify fallback. A plain endpoint touches
// nothing but the follows row.
//
// Trust model: identity comes from the session (guests rejected — no email to
// alert), the email snapshot from the auth user, and RLS enforces owner-only
// rows + active-kitchen targets.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Sign in to follow" }, { status: 401 });
  }

  let cookId = "";
  try {
    cookId = String((await req.json())?.cookId ?? "");
  } catch {
    /* fall through to 400 */
  }
  if (!cookId) {
    return NextResponse.json({ error: "Missing cookId" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("follows")
    .select("id")
    .eq("profile_id", user.id)
    .eq("cook_id", cookId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: "Couldn't unfollow" }, { status: 500 });
    }
    return NextResponse.json({ following: false });
  }

  const { error } = await supabase.from("follows").insert({
    profile_id: user.id,
    cook_id: cookId,
    email: user.email ?? null,
  });
  if (error) {
    // Most likely RLS: kitchen no longer active. Surface it — a silent
    // no-op that re-renders as "Follow" again is worse than the truth.
    return NextResponse.json(
      { error: "This kitchen can't be followed right now" },
      { status: 409 }
    );
  }
  return NextResponse.json({ following: true });
}
