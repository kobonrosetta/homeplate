import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "@/components/reset-password-form";

export const dynamic = "force-dynamic";

// Reached by following a password-reset link: /auth/callback exchanges the
// recovery code for a session and forwards here. If that session exists, the
// user can set a new password; if not (link expired, opened on a different
// device, or navigated here directly), we send them to request a fresh link.
export default async function ResetPasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-[78vh] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-ink">Set a new password</h1>

      {user ? (
        <>
          <p className="mt-1 text-muted">
            Choose a new password for {user.email ?? "your account"}.
          </p>
          <ResetPasswordForm />
        </>
      ) : (
        <div className="mt-4 rounded-xl bg-card p-4 text-sm text-ink shadow-soft">
          This reset link is invalid or has expired.{" "}
          <Link
            href="/forgot-password"
            className="font-medium text-brand hover:underline"
          >
            Request a new one
          </Link>
          .
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
