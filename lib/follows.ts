import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, wrapEmail, escapeHtml } from "@/lib/email";
import { formatUsd } from "@/lib/constants";

// A cook adding several dishes in one session sends ONE alert, not one per
// dish. Six hours is long enough to cover a menu-update session and short
// enough that tomorrow's new dish still announces itself.
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Email every follower of a kitchen about a newly posted dish. Server-only
// (service role): follows rows are owner-only under RLS, so the notifier is
// the one place besides the follower themselves that reads them. Silent no-op
// for pending/paused kitchens, kitchens with no followers, or within the
// cooldown — callers never need to check.
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

    const { data: fans } = await admin
      .from("follows")
      .select("email")
      .eq("cook_id", cookId)
      .not("email", "is", null)
      .limit(200);
    const emails = [
      ...new Set((fans ?? []).map((f: any) => f.email).filter(Boolean)),
    ] as string[];
    if (emails.length === 0) return;

    // Stamp BEFORE sending (at-most-once bias, same as order reminders): a
    // crash mid-send must not re-alert everyone on the next dish.
    await admin
      .from("cooks")
      .update({ followers_notified_at: new Date().toISOString() })
      .eq("id", cookId);

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

    // One send per follower — followers must never see each other's addresses.
    for (const to of emails) {
      await sendEmail({
        to,
        subject: `New from ${cook.business_name}: ${dishTitle}`,
        html,
      });
    }
  } catch {
    // Alerts are best-effort — never let them break posting a dish.
  }
}
