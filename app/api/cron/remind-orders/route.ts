import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, sendEmail, wrapEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Nudge cooks about paid orders they haven't acknowledged. Hit on a
// schedule (GitHub Actions, .github/workflows/order-reminders.yml) with
// Authorization: Bearer CRON_SECRET. Each order is reminded at most once
// (reminder_sent_at is claimed before the email goes out), and only while
// it still sits in 'confirmed' — tapping "I'm on it" ends the nagging.
const REMIND_AFTER_MINUTES = 45;
// Ignore anything older than a day — protects against a reminder storm
// over stale orders the first time this runs on an existing database.
const MAX_AGE_HOURS = 24;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const staleBefore = new Date(now - REMIND_AFTER_MINUTES * 60_000).toISOString();
  const oldest = new Date(now - MAX_AGE_HOURS * 3_600_000).toISOString();

  const { data: orders, error } = await admin
    .from("orders")
    .select("id, cook_id, created_at, order_items(title, quantity)")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .lt("created_at", staleBefore)
    .gt("created_at", oldest);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let reminded = 0;
  for (const order of orders ?? []) {
    // Claim before sending so a concurrent or retried run can't double-email.
    const { data: claimed } = await admin
      .from("orders")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", order.id)
      .is("reminder_sent_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const { data: cook } = await admin
      .from("cooks")
      .select("business_name, profile_id")
      .eq("id", order.cook_id)
      .maybeSingle();
    const res = cook?.profile_id
      ? await admin.auth.admin.getUserById(cook.profile_id)
      : null;
    const cookEmail = res?.data?.user?.email;
    if (!cookEmail) continue;

    const items = (order.order_items ?? [])
      .map((i: any) => `${i.quantity}× ${escapeHtml(i.title)}`)
      .join(", ");
    const minutes = Math.round(
      (now - new Date(order.created_at).getTime()) / 60_000
    );
    await sendEmail({
      to: cookEmail,
      subject: `Reminder: an order is waiting — ${cook?.business_name ?? "your kitchen"}`,
      html: wrapEmail(
        `<h2>An order is still waiting</h2>
         <p><strong>${items}</strong></p>
         <p>This paid order came in about ${minutes} minutes ago and hasn't been
         started yet. The buyer is waiting to hear you're on it.</p>
         <p>Open My Kitchen → Orders and tap <strong>"I'm on it"</strong>.</p>`
      ),
    });
    reminded++;
  }

  return NextResponse.json({ checked: orders?.length ?? 0, reminded });
}
