import { createClient } from "@/lib/supabase/server";

// Emails allowed into /admin, from the ADMIN_EMAILS env var (comma-separated).
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

// Returns the signed-in admin user, or null if the caller isn't an admin.
// Server-only; every admin page and action must gate on this.
export async function getAdminUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous || !isAdminEmail(user.email)) return null;
  return user;
}
