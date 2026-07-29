"use client";

import { useFormStatus } from "react-dom";

// Follow/unfollow toggle. The server component that renders this decides
// whether the viewer may follow (signed in, not a guest session) and passes
// the current state; the server action re-derives everything it trusts.
export default function FollowButton({
  action,
  cookId,
  slug,
  following,
}: {
  action: (formData: FormData) => void;
  cookId: string;
  slug: string;
  following: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="cook_id" value={cookId} />
      <input type="hidden" name="slug" value={slug} />
      <Btn following={following} />
    </form>
  );
}

function Btn({ following }: { following: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
        following
          ? "border-line bg-line text-ink hover:border-muted"
          : "border-brand text-brand hover:bg-brand hover:text-white"
      }`}
    >
      {pending ? "…" : following ? "♥ Following" : "♡ Follow"}
    </button>
  );
}
