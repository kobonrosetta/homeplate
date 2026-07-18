"use client";

import { useState } from "react";

type Review = { rating: number; comment: string | null; created_at: string };

// Reviews arrive already sorted newest-first from the server. At >=5 reviews we
// show a clickable ratings-distribution bar (Baymard: the most-used part of a
// review section); clicking a bar filters the list to that rating.
export default function ReviewsSection({ reviews }: { reviews: Review[] }) {
  const [filter, setFilter] = useState<number | null>(null);
  const count = reviews.length;
  if (count === 0) return null;

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / count;
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    n: reviews.filter((r) => r.rating === star).length,
  }));
  const max = Math.max(1, ...dist.map((d) => d.n));
  const showDistribution = count >= 5;

  const list = filter
    ? reviews.filter((r) => r.rating === filter)
    : reviews.filter((r) => r.comment);

  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold text-ink">Reviews</h2>

      {showDistribution && (
        <div className="mt-4 flex flex-col gap-5 rounded-xl border border-line p-5 sm:flex-row sm:items-center">
          <div className="shrink-0 text-center">
            <div className="text-4xl font-semibold text-ink">
              {avg.toFixed(1)}
            </div>
            <div className="text-sm text-amber-500">
              {"★".repeat(Math.round(avg))}
              <span className="text-faint">
                {"★".repeat(Math.max(0, 5 - Math.round(avg)))}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted">{count} reviews</div>
          </div>
          <div className="flex-1 space-y-1.5">
            {dist.map((d) => (
              <button
                key={d.star}
                onClick={() => setFilter(filter === d.star ? null : d.star)}
                className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-card ${
                  filter === d.star ? "bg-card" : ""
                }`}
              >
                <span className="w-7 shrink-0 text-muted">{d.star}★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-amber-400"
                    style={{ width: `${(d.n / max) * 100}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right text-muted">{d.n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {filter && (
        <button
          onClick={() => setFilter(null)}
          className="mt-3 text-sm text-brand hover:underline"
        >
          Showing {filter}★ only · clear filter
        </button>
      )}

      <div className="mt-4 space-y-4">
        {list.length === 0 ? (
          <p className="text-sm text-muted">No written reviews yet.</p>
        ) : (
          list.map((r, i) => (
            <div key={i} className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <div className="text-amber-500">
                  {"★".repeat(r.rating)}
                  <span className="text-faint">
                    {"★".repeat(Math.max(0, 5 - r.rating))}
                  </span>
                </div>
                <span className="text-xs text-faint">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {r.comment ? (
                <p className="mt-1 text-sm text-ink">{r.comment}</p>
              ) : (
                <p className="mt-1 text-sm text-faint">No comment left.</p>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
