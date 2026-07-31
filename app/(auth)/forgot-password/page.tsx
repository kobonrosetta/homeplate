import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { SubmitButton, FormError } from "@/components/form";

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string; sent?: string };
}) {
  const sent = searchParams.sent === "1";

  return (
    <main className="mx-auto flex min-h-[78vh] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-ink">Reset your password</h1>

      {sent ? (
        <div className="mt-4 rounded-xl bg-card p-4 text-sm text-ink shadow-soft">
          If an account exists for that email, we&apos;ve sent a link to reset
          your password. Check your inbox — and your spam folder, just in case.
          The link expires after a little while, so use it soon.
        </div>
      ) : (
        <>
          <p className="mt-1 text-muted">
            Enter your email and we&apos;ll send you a link to set a new one.
          </p>

          {searchParams.error && (
            <FormError message={searchParams.error} className="mt-4" />
          )}

          <form action={requestPasswordReset} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line"
              />
            </label>
            <SubmitButton>Send reset link</SubmitButton>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
