import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailBatch, wrapEmail, escapeHtml } from "@/lib/email";
import { SITE_URL, formatUsd } from "@/lib/constants";

// Follower alerts hard-cap how many addresses one kitchen can blast. Past it
// we send to the OLDEST follows first (stable, deterministic) and log that
// the cap bound — silent truncation would read as "everyone was notified".
const FOLLOWER_CAP = 200;

export type DigestDish = { title: string; price_cents: number };

// Email a kitchen's followers a digest of one or more newly posted dishes.
// Server-only (service role): follows rows are owner-only under RLS, so this is
// the one place besides the follower themselves that reads them. Returns how
// many messages Resend accepted and how many recipients there were, so the
// caller (the announce-dishes cron) can decide whether to mark the dishes
// announced — a total send failure leaves them un-announced to retry next run.
// Never throws.
export async function sendDishDigest(
  cookId: string,
  cook: { business_name: string; slug: string },
  dishes: DigestDish[]
): Promise<{ accepted: number; recipients: number }> {
  try {
    if (dishes.length === 0) return { accepted: 0, recipients: 0 };

    const admin = createAdminClient();
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
      return { accepted: 0, recipients: 0 };
    }
    const emails = [
      ...new Set((fans ?? []).map((f: any) => f.email).filter(Boolean)),
    ] as string[];
    if (emails.length === 0) return { accepted: 0, recipients: 0 };
    if ((fans ?? []).length === FOLLOWER_CAP) {
      console.warn(
        `[follows] follower cap (${FOLLOWER_CAP}) hit for cook ${cookId} — followers past the cap were not notified`
      );
    }

    const url = `${SITE_URL}/kitchen/${cook.slug}`;
    const name = escapeHtml(cook.business_name);
    const rows = dishes
      .map(
        (d) =>
          `<p style="font-size:17px;margin:4px 0"><strong>${escapeHtml(
            d.title
          )}</strong> · ${formatUsd(d.price_cents)}</p>`
      )
      .join("");
    const lead =
      dishes.length === 1
        ? `<strong>${name}</strong> just posted something new:`
        : `<strong>${name}</strong> just posted ${dishes.length} new dishes:`;
    const html = wrapEmail(`
      <p>${lead}</p>
      ${rows}
      <p><a href="${url}" style="display:inline-block;background:#b45309;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600">See the menu</a></p>
      <p style="font-size:12px;color:#a8a29e">You're getting this because you follow ${name} on HomePlate. You can unfollow anytime on <a href="${url}">their kitchen page</a>.</p>
    `);
    const subject =
      dishes.length === 1
        ? `New from ${cook.business_name}: ${dishes[0].title}`
        : `New from ${cook.business_name}: ${dishes.length} new dishes`;

    // One recipient per message (addresses never shared), batched 100 per
    // API call — 200 followers is 2 HTTP round-trips, not 200.
    const accepted = await sendEmailBatch(
      emails.map((to) => ({ to, subject, html }))
    );
    if (accepted < emails.length) {
      console.error(
        `[follows] digest for cook ${cookId}: ${accepted}/${emails.length} emails accepted by Resend${
          accepted === 0 ? " — dishes left un-announced, next sweep retries" : ""
        }`
      );
    }
    return { accepted, recipients: emails.length };
  } catch (e) {
    console.error(
      `[follows] digest failed for cook ${cookId}: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
    return { accepted: 0, recipients: 0 };
  }
}
