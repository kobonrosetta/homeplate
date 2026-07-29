"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    options: {
      data: { full_name: String(formData.get("full_name") ?? "") },
    },
  });

  if (error) {
    redirect("/signup?error=" + encodeURIComponent(error.message));
  }

  const intent = String(formData.get("intent") ?? "order");
  revalidatePath("/", "layout");
  redirect(intent === "sell" ? "/sell" : "/browse");
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
