"use client";

import Link from "next/link";
import { TextField, SubmitButton } from "@/components/form";
import GoogleButton, { OrDivider } from "@/components/google-button";
import { safeNext } from "@/lib/safe-next";

// Signup is buyer-first: almost everyone creating an account is here to order,
// so we don't make them declare a role. Cooks open a kitchen via the "Apply to
// sell" link (here and in the footer), which runs the /sell wizard — and any
// buyer can convert to a cook later the same way. The signup action defaults a
// missing `intent` to ordering, so this form sends new accounts to /browse.
// An explicit `next` (e.g. a kitchen a guest wanted to follow) overrides that.
export default function SignupForm({
  action,
  selling = false,
  next,
}: {
  action: (formData: FormData) => void;
  selling?: boolean;
  next?: string;
}) {
  const fallback = selling ? "/sell?start=1" : "/browse";
  const dest = safeNext(next, fallback);
  return (
    <form action={action} className="mt-6 space-y-4">
      {selling && <input type="hidden" name="intent" value="sell" />}
      {dest !== fallback && <input type="hidden" name="next" value={dest} />}
      <GoogleButton next={dest} />

      <OrDivider />

      <TextField
        label="Full name"
        name="full_name"
        type="text"
        required
        autoComplete="name"
      />
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
        autoComplete="new-password"
        minLength={8}
      />

      <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>

      {!selling && (
        <p className="pt-1 text-center text-sm text-muted">
          Run a permitted kitchen?{" "}
          <Link
            href="/signup?intent=sell"
            className="font-medium text-brand hover:underline"
          >
            Apply to sell →
          </Link>
        </p>
      )}
    </form>
  );
}
