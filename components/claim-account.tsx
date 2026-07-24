"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Shown on the confirmation page to a guest (anonymous) buyer. Turns their
// one-off guest session into a real account with a password, keeping this order
// — and future ones — attached to it. Entirely optional.
export default function ClaimAccount({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (done) {
    return (
      <div className="mt-6 rounded-xl border border-line bg-card p-4 text-sm text-ink">
        ✓ Almost done — we sent a confirmation link to your email. Click it to
        finish creating your account, then find this order anytime under
        &ldquo;Purchases.&rdquo;
      </div>
    );
  }

  async function claim() {
    if (!email || password.length < 6) {
      setErr("Enter your email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email, password });
    setBusy(false);
    if (error) setErr(error.message);
    else setDone(true);
  }

  return (
    <div className="mt-6 rounded-xl border border-line p-4 text-left">
      <p className="text-sm font-medium text-ink">Save your order — create an account</p>
      <p className="mt-1 text-xs text-muted">
        Set a password to track this order and check out faster next time. Optional.
      </p>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <div className="mt-3 space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-muted"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Create a password"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-muted"
        />
        <button
          type="button"
          onClick={claim}
          disabled={busy}
          className="w-full rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
      </div>
    </div>
  );
}
