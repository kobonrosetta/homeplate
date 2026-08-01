import { NextResponse } from "next/server";
import { getCurrentCook } from "@/lib/cook";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAccountLink } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Stripe hits this when a hosted onboarding link expires or is refreshed (account
// links are single-use and short-lived). We mint a fresh link and bounce the cook
// back into Stripe. The account id is derived from our own record.
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

  if (!row?.stripe_account_id) {
    return NextResponse.redirect(`${origin}/dashboard/payouts`);
  }

  try {
    const url = await createAccountLink({
      accountId: row.stripe_account_id,
      returnUrl: `${origin}/dashboard/payouts/return`,
      refreshUrl: `${origin}/dashboard/payouts/refresh`,
    });
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(
      `${origin}/dashboard/payouts?error=${encodeURIComponent(
        "Couldn't refresh payout setup. Please try again."
      )}`
    );
  }
}
