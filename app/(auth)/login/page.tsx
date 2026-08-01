import Link from "next/link";
import { login } from "../actions";
import { SubmitButton, TextField, FormError } from "@/components/form";
import GoogleButton, { OrDivider } from "@/components/google-button";
import { safeNext } from "@/lib/safe-next";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  // ?next= — where to land after signing in (e.g. a kitchen a guest wanted to
  // follow). Validated; defaults into the app (Browse), not the marketing home.
  // Carried onto Google, the form, the error redirect (via the action), and the
  // "create an account" cross-link.
  const dest = safeNext(searchParams.next, "/browse");
  const signUpHref =
    dest !== "/browse" ? `/signup?next=${encodeURIComponent(dest)}` : "/signup";
  return (
    <main className="mx-auto flex min-h-[78vh] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-ink">Welcome back</h1>
      <p className="mt-1 text-muted">Sign in to your account.</p>

      {searchParams.error && (
        <FormError message={searchParams.error} className="mt-4" />
      )}

      <div className="mt-6">
        <GoogleButton next={dest} />
      </div>

      <OrDivider />

      <form action={login} className="space-y-4">
        {dest !== "/" && <input type="hidden" name="next" value={dest} />}
        <TextField
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <div className="-mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-sm text-muted hover:text-ink"
          >
            Forgot your password?
          </Link>
        </div>
        <SubmitButton>Sign in</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href={signUpHref} className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
