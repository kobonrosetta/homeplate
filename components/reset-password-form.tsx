"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

// Shown on /reset-password after the user follows their recovery link (they
// arrive already signed in via a recovery session). Sets a new password with
// the browser client — same call ClaimAccount uses — then drops them into the
// app logged in.
export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setErr("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Those passwords don't match.");
      return;
    }
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    // New password saved and the recovery session is now a normal one — send
    // them home logged in. Full reload so the server picks up the session.
    window.location.href = "/";
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {err && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>
      )}
      <label className="block">
        <span className="text-sm font-medium text-ink">New password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">Confirm new password</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="Re-enter it"
          className="mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
