import Link from "next/link";
import { login } from "../actions";
import { SubmitButton } from "@/components/form";
import GoogleButton, { OrDivider } from "@/components/google-button";
import { safeNext } from "@/lib/safe-next";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  // ?next= — where to land after signing in (e.g. a kitchen a guest wanted to
  // follow). Validated; default home. Carried onto Google, the form, the error
  // redirect (via the action), and the "create an account" cross-link.
  const dest = safeNext(searchParams.next, "/");
  const signUpHref =
    dest !== "/" ? `/signup?next=${encodeURIComponent(dest)}` : "/signup";
  return (
    <main className="mx-auto flex min-h-[78vh] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-ink">Welcome back</h1>
      <p className="mt-1 text-muted">Sign in to your account.</p>

      {searchParams.error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <div className="mt-6">
        <GoogleButton next={dest} />
      </div>

      <OrDivider />

      <form action={login} className="space-y-4">
        {dest !== "/" && <input type="hidden" name="next" value={dest} />}
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
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

function Field({
  label,
  name,
  type,
  autoComplete,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line"
      />
    </label>
  );
}
