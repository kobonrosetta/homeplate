import { NextResponse } from "next/server";
import { getCurrentCook } from "@/lib/cook";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveAccount } from "@/lib/stripe";
import { syncCookStripeStatus } from "@/lib/connect";

export const dynamic = "force-dynamic";

// Where Stripe returns the cook after the hosted onboarding form. We re-read the
// account status server-side so the dashboard reflects completion immediately —
// but the account.updated webhook remains the source of truth. The account id is
// always derived from OUR record for the signed-in cook, never from a query param.
export async function GET(req: Request) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const { user, cook } = await getCurrentCook();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  if (!cook) return NextResponse.redirect(`${origin}/sell`);

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("cook_stripe")
    .select("stripe_account_id")
    .eq("cook_id", cook.id)
    .maybeSingle();

  if (row?.stripe_account_id) {
    try {
      const status = await retrieveAccount(row.stripe_account_id);
      if (status && status !== "gone") {
        await syncCookStripeStatus(row.stripe_account_id, status, {
          cookIdHint: cook.id,
        });
      }
    } catch {
      // Best-effort immediacy only — the account.updated webhook (which retries
      // on failure) is the source of truth, so don't block the redirect.
    }
  }

  return NextResponse.redirect(`${origin}/dashboard/payouts`);
}
