import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, sendEmail, wrapEmail } from "@/lib/email";
import { SITE_URL, SUPPORT_EMAIL } from "@/lib/constants";

// Inline email link/button — matches the brand accent in wrapEmail.
function emailLink(href: string, label: string): string {
  return `<a href="${href}" style="color:#b45309;font-weight:600;text-decoration:none">${label}</a>`;
}

// Tell a cook when an admin moves their kitchen into 'active' (approved /
// reactivated) or 'suspended'. Without this a cook finishes onboarding, waits,
// and only discovers approval by logging back in. Best-effort — a failed email
// must never break the admin's status change.
//
// Approval is deliberately decoupled from going LIVE: a kitchen is only visible
// to buyers once payouts are also set up (stripe_ready). So the approval email
// branches on stripe_ready — "you're live" vs "one step left" — instead of
// promising visibility the kitchen doesn't have yet.
export async function notifyCookStatusChange(opts: {
  profileId: string | null;
  businessName: string | null;
  slug: string | null;
  stripeReady: boolean;
  prevStatus: string;
  newStatus: string;
}): Promise<void> {
  try {
    if (opts.newStatus === opts.prevStatus) return;
    if (opts.newStatus !== "active" && opts.newStatus !== "suspended") return;
    if (!opts.profileId) return;

    const admin = createAdminClient();
    const res = await admin.auth.admin.getUserById(opts.profileId);
    const email = res?.data?.user?.email;
    if (!email) return;

    const kitchen = escapeHtml(opts.businessName ?? "your kitchen");
    const dashUrl = `${SITE_URL}/dashboard`;

    if (opts.newStatus === "active") {
      const reactivated = opts.prevStatus === "suspended";
      if (opts.stripeReady && opts.slug) {
        // Approved AND payout-ready → genuinely live and visible to buyers.
        const storefront = `${SITE_URL}/kitchen/${opts.slug}`;
        await sendEmail({
          to: email,
          subject: reactivated
            ? `${opts.businessName ?? "Your kitchen"} is back on ForkFork`
            : "You're live on ForkFork",
          html: wrapEmail(
            `<h2>${
              reactivated ? "Your kitchen is back" : "You're approved — and live"
            }</h2>
             <p>${kitchen} is ${
               reactivated ? "active again" : "approved"
             } and buyers can find and order from you now.</p>
             <p>${emailLink(storefront, "View your storefront →")}</p>
             <p>That link is your storefront. Drop it in your WhatsApp groups,
             Instagram bio, anywhere your people are. Manage orders and your
             menu from ${emailLink(dashUrl, "your dashboard")}.</p>`
          ),
        });
      } else {
        // Approved but not payout-ready → NOT yet visible. Don't imply it is.
        const payoutsUrl = `${SITE_URL}/dashboard/payouts`;
        await sendEmail({
          to: email,
          subject: "You're approved: one step to go live on ForkFork",
          html: wrapEmail(
            `<h2>${kitchen} is approved</h2>
             <p>You're through review. One thing left before buyers can see
             you: set up payouts so Stripe can send you your earnings.</p>
             <p>${emailLink(payoutsUrl, "Set up payouts →")}</p>
             <p>The moment that's done, your kitchen goes live.</p>`
          ),
        });
      }
    } else if (opts.newStatus === "suspended") {
      await sendEmail({
        to: email,
        subject: "Your ForkFork kitchen has been suspended",
        html: wrapEmail(
          `<h2>Your kitchen has been suspended</h2>
           <p>${kitchen} is no longer visible to buyers on ForkFork.</p>
           <p>If this is a surprise or you'd like to sort it out, reply to this
           email or reach us at ${escapeHtml(SUPPORT_EMAIL)}. We're happy to
           talk it through.</p>`
        ),
      });
    }
  } catch {
    /* notifications must never break the admin status change */
  }
}
