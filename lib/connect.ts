// Stripe Connect status sync — SERVER ONLY (uses the service-role admin client).
// Persists a connected account's onboarding/capability status to cook_stripe and
// recomputes the public `cooks.stripe_ready` gate. Shared by the account.updated
// webhook and the onboarding return route so they can never disagree.

import { createAdminClient } from "@/lib/supabase/admin";
import type { ConnectAccountStatus } from "@/lib/stripe";

/**
 * Match a connected account (by its Stripe id) to its cook and write the status.
 * THROWS on any DB failure — the webhook translates that into a 5xx so Stripe
 * redelivers the event (its retry schedule is our reconciliation loop; a
 * swallowed error here would silently strand a cook's readiness forever).
 *
 * opts.cookIdHint: the account's metadata.cook_id — used to (re)create the
 * cook_stripe row when the account id matches nothing, which happens if the
 * account.updated event outruns startStripeOnboarding's row write, or if that
 * write failed. Without a hint, an unmatched id is warned and skipped (e.g. an
 * event from the wrong Stripe environment).
 *
 * opts.clearAccountId: null out the stored account id (deauthorized/dead
 * accounts) so the next "Set up payouts" mints a fresh account instead of
 * retrying one the platform can no longer access.
 */
export async function syncCookStripeStatus(
  accountId: string | null | undefined,
  status: ConnectAccountStatus,
  opts?: { cookIdHint?: string | null; clearAccountId?: boolean }
): Promise<void> {
  if (!accountId) return;
  const admin = createAdminClient();

  // Ready to sell only when the cook can BOTH receive a transfer and be paid out
  // (and has finished onboarding). transfers_active is the correct signal, not
  // charges_enabled — see accountStatus() in lib/stripe.ts.
  const ready =
    status.transfersActive && status.payoutsEnabled && status.detailsSubmitted;

  const statusRow = {
    transfers_active: status.transfersActive,
    payouts_enabled: status.payoutsEnabled,
    details_submitted: status.detailsSubmitted,
    disabled_reason: status.disabledReason,
    updated_at: new Date().toISOString(),
  };

  const { data: rows, error: updateErr } = await admin
    .from("cook_stripe")
    .update(
      opts?.clearAccountId ? { ...statusRow, stripe_account_id: null } : statusRow
    )
    .eq("stripe_account_id", accountId)
    .select("cook_id");
  if (updateErr) throw new Error(`cook_stripe update: ${updateErr.message}`);

  let cookId = rows?.[0]?.cook_id ?? null;

  if (!cookId && opts?.cookIdHint) {
    // No row carries this account id yet — the event beat (or the DB dropped)
    // startStripeOnboarding's write. The account's own metadata names the cook,
    // so heal the mapping — but NEVER overwrite a different account id already
    // stored for that cook: a stray event from an orphaned/abandoned account
    // (Stripe fires account.updated at creation) must not hijack the row from
    // the account the cook actually onboarded.
    const { data: current, error: readErr } = await admin
      .from("cook_stripe")
      .select("stripe_account_id")
      .eq("cook_id", opts.cookIdHint)
      .maybeSingle();
    if (readErr) throw new Error(`cook_stripe read: ${readErr.message}`);
    if (current && current.stripe_account_id) {
      console.warn(
        `[connect] ignoring event from ${accountId} — cook ${opts.cookIdHint} is bound to ${current.stripe_account_id}`
      );
      return;
    }
    const { error: upsertErr } = await admin
      .from("cook_stripe")
      .upsert(
        { cook_id: opts.cookIdHint, stripe_account_id: accountId, ...statusRow },
        { onConflict: "cook_id" }
      );
    if (upsertErr) {
      // FK violation = the cook row no longer exists (deleted kitchen). That is
      // permanent — acking beats a 3-day webhook retry storm.
      if (upsertErr.code === "23503") {
        console.warn(`[connect] account ${accountId} maps to a deleted cook`);
        return;
      }
      throw new Error(`cook_stripe upsert: ${upsertErr.message}`);
    }
    cookId = opts.cookIdHint;
  }

  if (!cookId) {
    console.warn(`[connect] status update for unknown account ${accountId}`);
    return;
  }

  const { error: readyErr } = await admin
    .from("cooks")
    .update({ stripe_ready: ready })
    .eq("id", cookId);
  if (readyErr) throw new Error(`cooks.stripe_ready update: ${readyErr.message}`);
}
