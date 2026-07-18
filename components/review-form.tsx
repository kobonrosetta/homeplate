"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { submitReview } from "@/app/orders/actions";

export default function ReviewForm({ orderId }: { orderId: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

  return (
    <form action={submitReview} className="mt-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="rating" value={rating} />

      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="text-2xl leading-none"
          >
            <span
              className={(hover || rating) >= n ? "text-amber-500" : "text-faint"}
            >
              ★
            </span>
          </button>
        ))}
      </div>

      <textarea
        name="comment"
        rows={2}
        placeholder="Tell others how it was (optional)"
        className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-muted"
      />

      <SubmitButton disabled={rating === 0} />
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="mt-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
    >
      {pending ? "Posting…" : "Post review"}
    </button>
  );
}
