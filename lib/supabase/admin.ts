// Service-role Supabase client — BYPASSES Row Level Security.
// Server-only. Use only for trusted server actions (e.g. confirming an order
// after Stripe reports payment, which the buyer's own session can't do).
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
