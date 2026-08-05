import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { notifyAdmins, escapeHtml } from "@/lib/email";

// Handles the email-confirmation / magic-link redirect from Supabase.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` can come from a public link (OAuth redirectTo), so validate it as
  // an internal path — never redirect to an attacker-supplied absolute URL.
  const next = safeNext(searchParams.get("next"), "/browse");

  // Behind a host like Render, request.url is the *internal* address
  // (e.g. http://localhost:10000), so redirecting to its origin sends the user
  // to a dead localhost URL. Build redirects from the public URL instead:
  // the proxy's forwarded host first, then NEXT_PUBLIC_SITE_URL, then origin (local dev).
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const base = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : process.env.NEXT_PUBLIC_SITE_URL ?? origin;

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Best-effort: ping admins when a NEW Google user signs up. Email/password
      // signups are pinged from the signup action, so this only covers OAuth.
      // Fire-and-forget so it never delays the sign-in redirect; guarded to fire
      // once (fresh account) and never on returning logins, email-confirmation,
      // magic-link exchanges, or guests.
      try {
        const user = data.user;
        if (
          user &&
          !user.is_anonymous &&
          user.app_metadata?.provider === "google" &&
          Date.now() - new Date(user.created_at).getTime() < 120_000
        ) {
          void notifyAdmins(
            "New ForkFork signup (Google)",
            `<h2>New signup</h2>
             <p><strong>${escapeHtml(user.email ?? "")}</strong></p>
             <p>Signed up with Google.</p>`
          );
        }
      } catch {
        /* best-effort — a notification must never block sign-in */
      }
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  // A failed exchange on the password-reset path almost always means the link
  // expired or was already used — send them back to request a fresh one, not to
  // the login page they couldn't get past in the first place.
  if (next === "/reset-password") {
    return NextResponse.redirect(
      `${base}/forgot-password?error=${encodeURIComponent(
        "That reset link has expired or already been used. Request a new one."
      )}`
    );
  }

  return NextResponse.redirect(`${base}/login?error=Could not sign you in`);
}
