import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailBatch, wrapEmail, escapeHtml } from "@/lib/email";
import { formatUsd } from "@/lib/constants";

// A cook adding several dishes in one session sends ONE alert, not one per
// dish. Six hours is long enough to cover a menu-update session and short
// enough that tomorrow's new dish still announces itself.
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Follower alerts hard-cap how many addresses one kitchen can blast. Past it
// we send to the OLDEST follows first (stable, deterministic) and log that
// the cap bound — silent truncation would read as "everyone was notified".
const FOLLOWER_CAP = 200;

// Email every follower of a kitchen about a newly posted dish. Server-only
// (service role): follows rows are owner-only under RLS, so the notifier is
// the one place besides the follower themselves that reads them.
//
// Failure honesty: the debounce stamp is written AFTER a successful send —
// if every send fails (Resend outage, unverified sender domain), nothing is
// stamped, the failure is logged, and the cook's NEXT dish retries the alert.
// A partial success stamps (so delivered followers aren't re-blasted) and
// logs the shortfall. This function never throws — callers fire-and-forget.
export async function notifyFollowersOfNewDish(
  cookId: string,
  dishTitle: string,
  priceCents: number
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: cook } = await admin
      .from("cooks")
      .select("business_name, slug, status, followers_notified_at")
      .eq("id", cookId)
      .maybeSingle();
    if (!cook || cook.status !== "active") return;
    if (
      cook.followers_notified_at &&
      Date.now() - new Date(cook.followers_notified_at).getTime() <
        ALERT_COOLDOWN_MS
    ) {
      return;
    }

    const { data: fans, error: fansErr } = await admin
      .from("follows")
      .select("email")
      .eq("cook_id", cookId)
      .not("email", "is", null)
      .order("created_at", { ascending: true })
      .limit(FOLLOWER_CAP);
    if (fansErr) {
      console.error(
        `[follows] could not load followers for cook ${cookId}: ${fansErr.message}`
      );
      return;
    }
    const emails = [
      ...new Set((fans ?? []).map((f: any) => f.email).filter(Boolean)),
    ] as string[];
    if (emails.length === 0) return;
    if ((fans ?? []).length === FOLLOWER_CAP) {
      console.warn(
        `[follows] follower cap (${FOLLOWER_CAP}) hit for cook ${cookId} — followers past the cap were not notified`
      );
    }

    const site =
      process.env.NEXT_PUBLIC_SITE_URL || "https://homeplate-jyd2.onrender.com";
    const url = `${site}/kitchen/${cook.slug}`;
    const name = escapeHtml(cook.business_name);
    const html = wrapEmail(`
      <p><strong>${name}</strong> just posted something new:</p>
      <p style="font-size:17px"><strong>${escapeHtml(dishTitle)}</strong> · ${formatUsd(priceCents)}</p>
      <p><a href="${url}" style="display:inline-block;background:#b45309;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600">See the menu</a></p>
      <p style="font-size:12px;color:#a8a29e">You're getting this because you follow ${name} on HomePlate. You can unfollow anytime on <a href="${url}">their kitchen page</a>.</p>
    `);
    const subject = `New from ${cook.business_name}: ${dishTitle}`;

    // One recipient per message (addresses never shared), batched 100 per
    // API call — 200 followers is 2 HTTP round-trips, not 200.
    const accepted = await sendEmailBatch(
      emails.map((to) => ({ to, subject, html }))
    );

    if (accepted > 0) {
      await admin
        .from("cooks")
        .update({ followers_notified_at: new Date().toISOString() })
        .eq("id", cookId);
    }
    if (accepted < emails.length) {
      console.error(
        `[follows] alert for cook ${cookId} ("${dishTitle}"): ${accepted}/${emails.length} emails accepted by Resend${
          accepted === 0 ? " — nothing stamped, next dish will retry" : ""
        }`
      );
    }
  } catch (e) {
    console.error(
      `[follows] alert failed for cook ${cookId}: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }
}
