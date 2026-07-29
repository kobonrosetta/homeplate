"use client";

import { useState } from "react";

// Client-side follow toggle used by both the kitchen page and the order-
// confirmation page. It calls /api/follow and updates only the button, so it
// works on pages that must NOT re-render on follow (the confirmation page
// re-verifies the Stripe session when rendered) and it surfaces a rejected
// follow as a visible message instead of a silent no-op.
export default function FollowToggle({
  cookId,
  initialFollowing = false,
}: {
  cookId: string;
  initialFollowing?: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || "Couldn't update — please try again.");
        return;
      }
      setFollowing(Boolean(body?.following));
    } catch {
      setError("Couldn't update — please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`rounded-full border px-4 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
          following
            ? "border-line bg-line text-ink hover:border-muted"
            : "border-brand text-brand hover:bg-brand hover:text-white"
        }`}
      >
        {pending ? "…" : following ? "♥ Following" : "♡ Follow"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
