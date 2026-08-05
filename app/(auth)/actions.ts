"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { captureServer } from "@/lib/analytics-server";
import { notifyAdmins, escapeHtml } from "@/lib/email";

// Supabase auth errors are machine-voiced ("Invalid login credentials") and
// land in the form-error box at the exact moment a user is already frustrated.
// Map the common ones to human copy; fall back to the raw message otherwise.
function friendlyAuthError(raw: string | null | undefined): string {
  const m = (raw ?? "").toLowerCase();
  if (m.includes("invalid login credentials"))
    return "That email and password don't match. Try again, or reset your password.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "You already have an account with that email. Sign in instead.";
  if (m.includes("password should be at least"))
    return "Your password needs to be at least 6 characters.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email first. Check your inbox for the link.";
  return raw && raw.trim() ? raw : "Something went wrong. Please try again.";
}

export async function login(formData: FormData) {
  // Where to land after signing in (e.g. back to the kitchen a guest wanted to
  // follow). Validated as an internal path. Defaults into the app (Browse), not
  // the marketing home — the home page ("/") now renders for signed-in users too
  // (the logo returns there), so a fresh login still drops you into the app.
  const next = safeNext(formData.get("next") as string | null, "/browse");
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });

  if (error) {
    redirect(
      "/login?error=" +
        encodeURIComponent(friendlyAuthError(error.message)) +
        (next !== "/browse" ? `&next=${encodeURIComponent(next)}` : "")
    );
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signup(formData: FormData) {
  const intent = String(formData.get("intent") ?? "order");
  // An explicit `next` (e.g. a kitchen a guest wanted to follow) wins over the
  // intent-based default. Validated as an internal path.
  const next = safeNext(
    formData.get("next") as string | null,
    intent === "sell" ? "/sell?start=1" : "/browse"
  );

  // Preserve the intent/next context on any error bounce back to the form.
  const errSuffix =
    (intent === "sell" ? "&intent=sell" : "") +
    (next !== "/browse" && next !== "/sell?start=1"
      ? `&next=${encodeURIComponent(next)}`
      : "");

  // Confirm-password guard: a mistyped password on signup silently locks the
  // user out later (they can't log in and don't know why). Catch it here.
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("password_confirm") ?? "")) {
    redirect(
      "/signup?error=" +
        encodeURIComponent("Those passwords don’t match — please retype them.") +
        errSuffix
    );
  }

  const supabase = createClient();
  // Marketing opt-in rides in user metadata; the handle_new_user() trigger
  // copies it to profiles.marketing_opt_in (see supabase/marketing-opt-in.sql).
  const marketingOptIn = formData.get("marketing_opt_in") === "on";
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password,
    options: {
      data: {
        // Collected as separate first/last boxes, stored as one full_name so
        // nothing downstream (trigger, profiles.full_name, emails) has to change.
        full_name: [
          String(formData.get("first_name") ?? "").trim(),
          String(formData.get("last_name") ?? "").trim(),
        ]
          .filter(Boolean)
          .join(" "),
        marketing_opt_in: marketingOptIn ? "true" : "false",
      },
    },
  });

  if (error) {
    redirect(
      "/signup?error=" +
        encodeURIComponent(friendlyAuthError(error.message)) +
        errSuffix
    );
  }

  // Supply/demand funnel: was this a buyer or a cook-intent signup?
  captureServer(data.user?.id, "signup", { intent });

  // Best-effort admin ping on a genuinely NEW email/password signup (Google
  // signups are pinged from the OAuth callback instead). Fire-and-forget, like
  // captureServer above, so a slow Resend never delays the redirect. A brand-new
  // account carries identities; Supabase's anti-enumeration path returns a user
  // with an EMPTY identities array for an already-registered email, so gate on
  // that to avoid a false "new signup" alert for an account that already exists.
  if (data.user && (data.user.identities?.length ?? 0) > 0) {
    void notifyAdmins(
      `New ForkFork signup${intent === "sell" ? " (cook intent)" : ""}`,
      `<h2>New signup</h2>
       <p><strong>${escapeHtml(String(formData.get("email") ?? ""))}</strong></p>
       <p>Intent: ${
         intent === "sell" ? "wants to sell (cook)" : "buyer / order"
       }${data.session ? "" : " · hasn't confirmed their email yet"}.</p>`
    );
  }

  revalidatePath("/", "layout");
  // If email confirmation is required, signUp returns a user but NO session —
  // they're not authenticated yet. Don't drop them into the app with a "you're
  // all set" banner (they'd see signed-out content and any order would mint an
  // orphaned anonymous account). Send them to sign in once they've confirmed.
  if (!data.session) {
    redirect(
      "/login?notice=" +
        encodeURIComponent(
          "Account created! Check your email to confirm it, then sign in."
        ) +
        (next !== "/browse" && next !== "/sell?start=1"
          ? `&next=${encodeURIComponent(next)}`
          : "")
    );
  }
  // Session in hand → into the app with the "you're in" welcome flag.
  const sep = next.includes("?") ? "&" : "?";
  redirect(`${next}${sep}welcome=1`);
}

export async function signout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

// Email the user a password-reset link. The link lands on /auth/callback, which
// exchanges the code for a (recovery) session and forwards to /reset-password
// where they set a new password. We ALWAYS end on the same "check your email"
// screen — success or not — so the page never reveals whether an address has an
// account. (Google-only users can use this too; it just adds a password.)
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect(
      "/forgot-password?error=" +
        encodeURIComponent("Enter your email address.")
    );
  }

  const supabase = createClient();
  const h = headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  redirect("/forgot-password?sent=1");
}
