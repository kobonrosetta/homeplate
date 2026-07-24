"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// One-tap kitchen pause/resume. Runs as the cook's own session — the
// cooks_guard_update trigger (supabase/harden-cooks.sql) allows exactly
// this transition (active <-> paused) and nothing else, so a pending or
// suspended kitchen can't flip itself live.
export async function toggleKitchenPause() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cook } = await supabase
    .from("cooks")
    .select("id, slug, status")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!cook || (cook.status !== "active" && cook.status !== "paused")) {
    redirect("/dashboard/settings");
  }

  const next = cook.status === "active" ? "paused" : "active";
  const { error } = await supabase
    .from("cooks")
    .update({ status: next })
    .eq("id", cook.id);

  if (error) {
    redirect(
      "/dashboard/settings?error=" +
        encodeURIComponent("Couldn't update your kitchen — please try again.")
    );
  }

  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath(`/kitchen/${cook.slug}`);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/settings");
}
