"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Follow/unfollow a kitchen. Everything is re-derived server-side: the
// follower is the session user (guests are sent to sign up — they have no
// email to alert), and RLS enforces owner-only rows + active-kitchen targets.
// The email snapshot comes from the auth session, never from the form.
export async function toggleFollow(formData: FormData) {
  const cookId = String(formData.get("cook_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!cookId) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/signup");

  const { data: existing } = await supabase
    .from("follows")
    .select("id")
    .eq("profile_id", user!.id)
    .eq("cook_id", cookId)
    .maybeSingle();

  if (existing) {
    await supabase.from("follows").delete().eq("id", existing.id);
  } else {
    await supabase.from("follows").insert({
      profile_id: user!.id,
      cook_id: cookId,
      email: user!.email ?? null,
    });
  }

  if (slug) revalidatePath(`/kitchen/${slug}`);
}
