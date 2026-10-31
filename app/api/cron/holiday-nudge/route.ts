import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml, sendEmail, wrapEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/constants";
import {
  addDaysIso,
  formatDateLong,
  formatDateShort,
  pacificTodayIso,
  parsePickupDays,
  pickupDaysSentence,
} from "@/lib/availability";
import { holidayNudge, weeklyPickupHours } from "@/lib/holidays";

export const dynamic = "force-dynamic";

// "Taking Thanksgiving orders? Add your pickup day" — once per kitchen per
// holiday. Hit daily by .github/workflows/holiday-nudges.yml with
// Authorization: Bearer CRON_SECRET. Same rule as the dashboard prompt
// (holidayNudge): live kitchens offering pickup whose schedule doesn't cover
// the holiday, 5–35 days ahead. The holiday_nudges row (migration 44) is
// claimed BEFORE the email goes out, so a retried or overlapping run can't
// double-send; a failed send releases the claim so tomorrow's run retries.
const MIN_DAYS_AHEAD = 5;
const MAX_DAYS_AHEAD = 35;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = pacificTodayIso();
  const { data: cooks, error } = await admin
    .from("cooks")
    .select("id, business_name, profile_id, pickup_windows")
    .eq("status", "active")
    .eq("stripe_ready", true)
    .eq("pickup_available", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  for (const c of cooks ?? []) {
    const windows = (c.pickup_windows ?? []) as string[];
    const nudge = holidayNudge(windows, today, MAX_DAYS_AHEAD);
    if (!nudge || nudge.holiday.date < addDaysIso(today, MIN_DAYS_AHEAD)) {
      skipped++;
      continue;
    }
    const { holiday, suggestions } = nudge;

    const { error: claimError } = await admin
      .from("holiday_nudges")
      .insert({ cook_id: c.id, holiday_key: holiday.key });
    if (claimError) {
      if (claimError.code === "23505") {
        skipped++; // already sent for this holiday
        continue;
      }
      // e.g. the table doesn't exist yet (migration 44 not run): stop loudly.
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    const res = c.profile_id
      ? await admin.auth.admin.getUserById(c.profile_id)
      : null;
    const email = res?.data?.user?.email;
    const weeklyDays = pickupDaysSentence(parsePickupDays(windows));
    const hours = weeklyPickupHours(windows);
    const ok = email
      ? await sendEmail({
          to: email,
          subject: `Taking ${holiday.name} orders? Add your pickup day`,
          html: wrapEmail(
            `<h2>${escapeHtml(holiday.name)} is ${formatDateLong(holiday.date)}</h2>
             <p>Hi ${escapeHtml(c.business_name ?? "there")}, ${
               weeklyDays
                 ? `your pickups are on ${weeklyDays}, so customers can't order for ${escapeHtml(holiday.name)} yet.`
                 : `your pickup times don't include a ${escapeHtml(holiday.name)} day yet.`
             }</p>
             <p>Taking holiday orders? Add a pickup day (${suggestions
               .map((d) => formatDateShort(d))
               .join(" or ")}) with one tap on your dashboard:</p>
             <p><a href="${SITE_URL}/dashboard#holiday" style="color:#b45309;font-weight:600;text-decoration:none">Add a ${escapeHtml(holiday.name)} pickup day →</a></p>
             <p style="color:#8a7f6f;font-size:13px">${
               hours
                 ? `It uses your usual pickup times (${escapeHtml(hours)}), and you can change them in Settings.`
                 : "You can set the hours in Settings."
             } Not cooking that day? Just ignore this email.</p>`
          ),
        })
      : false;

    if (!ok) {
      await admin
        .from("holiday_nudges")
        .delete()
        .eq("cook_id", c.id)
        .eq("holiday_key", holiday.key);
      continue;
    }
    sent++;
  }

  return NextResponse.json({ sent, skipped });
}
