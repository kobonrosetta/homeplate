// Minimal in-memory fixed-window rate limiter — a cost/abuse cap, not a security
// boundary. Fine for the pilot's single Render instance; for multi-instance,
// swap the Map for a shared store (Upstash/Supabase counter). Keyed by a caller
// id (e.g. `ai:${userId}`).

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();

  // Opportunistic cleanup so the Map can't grow unbounded on a long-lived
  // instance (cheap: only when we happen to cross a window boundary).
  if (windows.size > 5000) {
    for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
  }

  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (w.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  }
  w.count++;
  return { ok: true, retryAfter: 0 };
}
