import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDishDigest, type DigestDish } from "@/lib/follows";

export const dynamic = "force-dynamic";

// Sweep un-announced dishes into one digest email per kitchen. Hit on a
// schedule (GitHub Actions, .github/workflows/announce-dishes.yml) with
// Authorization: Bearer CRON_SECRET. Replaces the old inline alert, whose 6h
// cooldown silently dropped every dish after a session's first.

// Wait this long after a cook's NEWEST un-announced dish before sending, so a
// posting session ("added 4 dishes this afternoon") coalesces into one digest.
const ANNOUNCE_AFTER_MINUTES = 10;
// At most one digest per kitchen per this window — protects followers' inboxes
// from a cook who posts sporadically all day. Nothing is lost, just deferred.
const DIGEST_MIN_INTERVAL_MINUTES = 30;
// Ignore un-announced dishes older than this — defense-in-depth against a
// backlog storm (the migration also backfills existing rows as announced).
const MAX_AGE_HOURS = 48;

type Row = {
  id: string;
  cook_id: string;
  title: string;
  price_cents: number;
  created_at: string;
  cooks: {
    business_name: string;
    slug: string;
    status: string;
    followers_notified_at: string | null;
  } | null;
};

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const oldest = new Date(now - MAX_AGE_HOURS * 3_600_000).toISOString();

  // Un-announced dishes from active kitchens, newest first.
  const { data: rows, error } = await admin
    .from("listings")
    .select(
      "id, cook_id, title, price_cents, created_at, cooks!inner(business_name, slug, status, followers_notified_at)"
    )
    .is("announced_at", null)
    .eq("kind", "dish")
    .eq("is_available", true)
    .eq("cooks.status", "active")
    .gt("created_at", oldest)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by cook.
  const byCook = new Map<string, Row[]>();
  for (const r of (rows ?? []) as unknown as Row[]) {
    if (!r.cooks) continue;
    const list = byCook.get(r.cook_id) ?? [];
    list.push(r);
    byCook.set(r.cook_id, list);
  }

  const settleBefore = now - ANNOUNCE_AFTER_MINUTES * 60_000;
  const intervalMs = DIGEST_MIN_INTERVAL_MINUTES * 60_000;
  let digestsSent = 0;
  let cooksAnnounced = 0;

  for (const [cookId, dishes] of byCook) {
    const cook = dishes[0].cooks!;
    // Still posting? Wait until the session settles (newest dish is old enough).
    const newest = Math.max(
      ...dishes.map((d) => new Date(d.created_at).getTime())
    );
    if (newest > settleBefore) continue;
    // Rate limit per kitchen.
    if (
      cook.followers_notified_at &&
      now - new Date(cook.followers_notified_at).getTime() < intervalMs
    ) {
      continue;
    }

    const digest: DigestDish[] = dishes.map((d) => ({
      title: d.title,
      price_cents: d.price_cents,
    }));
    const { accepted, recipients } = await sendDishDigest(
      cookId,
      { business_name: cook.business_name, slug: cook.slug },
      digest
    );

    // Mark the dishes announced when we sent to someone (accepted > 0) OR when
    // there was nobody to tell (recipients === 0) — otherwise they'd be
    // re-scanned every run forever. Only a genuine send FAILURE (recipients but
    // 0 accepted) leaves them un-announced to retry next sweep.
    const markAnnounced = accepted > 0 || recipients === 0;
    if (markAnnounced) {
      await admin
        .from("listings")
        .update({ announced_at: new Date().toISOString() })
        .in(
          "id",
          dishes.map((d) => d.id)
        );
      cooksAnnounced++;
    }
    if (accepted > 0) {
      await admin
        .from("cooks")
        .update({ followers_notified_at: new Date().toISOString() })
        .eq("id", cookId);
      digestsSent++;
    }
  }

  return NextResponse.json({
    cooksWithPending: byCook.size,
    cooksAnnounced,
    digestsSent,
  });
}
