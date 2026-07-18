import { createClient } from "@/lib/supabase/server";

// Returns the logged-in user and their kitchen (if they have one).
export async function getCurrentCook() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, cook: null };

  const { data: cooks } = await supabase
    .from("cooks")
    .select("*")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  return { user, cook: cooks?.[0] ?? null };
}
