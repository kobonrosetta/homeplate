"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import GoogleButton, { OrDivider } from "@/components/google-button";

type Intent = "order" | "sell" | null;

export default function SignupForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  const [intent, setIntent] = useState<Intent>(null);

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <span className="text-sm font-medium text-ink">I want to…</span>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <IntentCard
            label="Order food"
            sub="Buy from local kitchens"
            selected={intent === "order"}
            onClick={() => setIntent("order")}
          />
          <IntentCard
            label="Sell my food"
            sub="List your kitchen"
            selected={intent === "sell"}
            onClick={() => setIntent("sell")}
          />
        </div>
        <input type="hidden" name="intent" value={intent ?? ""} />
        {intent === null && (
          <p className="mt-2 text-xs text-muted">
            Pick one to continue — either way you can switch later.
          </p>
        )}
      </div>

      {/* Google works too, but we still need the choice above so we know
          where to send them. */}
      <GoogleButton
        disabled={intent === null}
        next={intent === "sell" ? "/sell" : "/browse"}
      />

      <OrDivider />

      <Field label="Full name" name="full_name" type="text" autoComplete="name" />
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
      />

      <Submit disabled={intent === null} />
    </form>
  );
}

function IntentCard({
  label,
  sub,
  selected,
  onClick,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border p-3 text-center " +
        (selected ? "border-brand bg-brand/10" : "border-line hover:border-muted")
      }
    >
      <p className="font-medium text-ink">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </button>
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

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Creating…" : "Create account"}
    </button>
  );
}
