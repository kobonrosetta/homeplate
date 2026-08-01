"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentCook } from "@/lib/cook";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConnectAccount, createAccountLink } from "@/lib/stripe";

function siteOrigin(): string {
  const h = headers();
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`
  );
}

// Send a cook into Stripe-hosted Express onboarding. Creates (or reuses) their
// connected account and stores the id in cook_stripe via the SERVICE ROLE — the
// account id lives in a service-role-only table (never on the public cooks row),
// and only the server ever writes it. Then redirects to the single-use hosted link.
export async function startStripeOnboarding() {
  const { user, cook } = await getCurrentCook();
  if (!user) redirect("/login");
  if (!cook) redirect("/sell");

  const admin = createAdminClient();

  // Reuse an existing account if the cook started onboarding before — only ever
  // create one account per cook. Creation is idempotency-keyed on the row's
  // GENERATION (updated_at, or 'first' before any row exists): retries and
  // parallel tabs within a generation dedupe to one Stripe account, while a
  // deauth-cleared row (fresh updated_at) correctly mints a brand-new one.
  const { data: existing } = await admin
    .from("cook_stripe")
    .select("stripe_account_id, updated_at")
    .eq("cook_id", cook.id)
    .maybeSingle();

  let accountId = existing?.stripe_account_id ?? null;
  if (!accountId) {
    let created: string;
    try {
      created = await createConnectAccount({
        cookId: cook.id,
        email: user.email,
        idempotencySalt: existing?.updated_at ?? "first",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't start payout setup.";
      redirect(`/dashboard/payouts?error=${encodeURIComponent(msg)}`);
    }
    accountId = created;
    // If this write fails the cook MUST NOT proceed into Stripe-hosted KYC —
    // they'd submit SSN/bank details for an account no DB row maps to, and the
    // webhook/return sync would never match it (supabase-js reports failures via
    // `error`, it never throws). The account.updated metadata.cook_id fallback in
    // lib/connect.ts is the belt-and-suspenders for anything that slips through.
    const { error: saveErr } = await admin
      .from("cook_stripe")
      .upsert(
        { cook_id: cook.id, stripe_account_id: created },
        { onConflict: "cook_id" }
      );
    if (saveErr) {
      redirect(
        `/dashboard/payouts?error=${encodeURIComponent(
          "Couldn't save your payout account. Please try again."
        )}`
      );
    }
  }

  const origin = siteOrigin();
  let url: string;
  try {
    url = await createAccountLink({
      accountId: accountId!,
      returnUrl: `${origin}/dashboard/payouts/return`,
      refreshUrl: `${origin}/dashboard/payouts/refresh`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't start payout setup.";
    redirect(`/dashboard/payouts?error=${encodeURIComponent(msg)}`);
  }
  redirect(url);
}
