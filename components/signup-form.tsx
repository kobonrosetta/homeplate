"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import GoogleButton, { OrDivider } from "@/components/google-button";

// Signup is buyer-first: almost everyone creating an account is here to order,
// so we don't make them declare a role. Cooks open a kitchen via the "Apply to
// sell" link (here and in the footer), which runs the /sell wizard — and any
// buyer can convert to a cook later the same way. The signup action defaults a
// missing `intent` to ordering, so this form sends new accounts to /browse.
export default function SignupForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="mt-6 space-y-4">
      <GoogleButton next="/browse" />

      <OrDivider />

      <Field label="Full name" name="full_name" type="text" autoComplete="name" />
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
      />

      <Submit />

      <p className="pt-1 text-center text-sm text-muted">
        Run a permitted kitchen?{" "}
        <Link href="/sell" className="font-medium text-brand hover:underline">
          Apply to sell →
        </Link>
      </p>
    </form>
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

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Creating…" : "Create account"}
    </button>
  );
}
