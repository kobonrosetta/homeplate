"use client";

import { useFormState, useFormStatus } from "react-dom";
import { joinWaitlist, type WaitlistState } from "@/app/browse/actions";

const initial: WaitlistState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
    >
      {pending ? "Adding…" : "Get notified"}
    </button>
  );
}

// Buyer waitlist capture. Email + optional zip; posts to the service-role
// server action. On success the form is replaced by a confirmation. `source`
// tags where the signup came from; `defaultEmail` prefills for a signed-in
// visitor. Includes a hidden honeypot ("company") to shed bot signups.
export default function WaitlistForm({
  source = "browse",
  defaultEmail = "",
}: {
  source?: string;
  defaultEmail?: string;
}) {
  const [state, formAction] = useFormState(joinWaitlist, initial);

  if (state.ok) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center">
        <p className="font-medium text-emerald-900">You&rsquo;re on the list.</p>
        <p className="mt-1 text-sm text-emerald-800">
          We&rsquo;ll email you the moment a verified kitchen opens near you.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mx-auto max-w-md text-left">
      <input type="hidden" name="source" value={source} />
      {/* Honeypot — hidden from real users, catches bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          name="email"
          required
          defaultValue={defaultEmail}
          placeholder="you@email.com"
          aria-label="Email address"
          className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-muted focus:ring-2 focus:ring-line"
        />
        <input
          type="text"
          name="zip"
          inputMode="numeric"
          maxLength={5}
          placeholder="ZIP (optional)"
          aria-label="ZIP code (optional)"
          className="w-full rounded-full border border-line bg-white px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-muted focus:ring-2 focus:ring-line sm:w-32"
        />
        <SubmitButton />
      </div>
      {state.error && (
        <p className="mt-2 text-center text-sm text-red-600 sm:text-left">
          {state.error}
        </p>
      )}
      <p className="mt-2 text-center text-xs text-faint sm:text-left">
        Just an email — no account needed. Your ZIP helps us tell you the second
        a kitchen opens in your area.
      </p>
    </form>
  );
}
