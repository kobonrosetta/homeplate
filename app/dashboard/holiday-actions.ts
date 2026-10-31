"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import { MAX_PICKUP_LINES } from "@/lib/constants";
import {
  activePickupWindows,
  datedPickupWindowDate,
  isIsoDate,
  pacificTodayIso,
} from "@/lib/availability";
import {
  holidayPickupLine,
  holidayPickupLines,
  upcomingHolidays,
  weeklyPickupHours,
} from "@/lib/holidays";

// One tap from the dashboard's holiday prompt (or the holiday email): add a
// holiday pickup day to the cook's own pickup times, the way they already
// work: their slot times if they list slots, else their usual hours. Only a
// date the prompt offers is accepted — an upcoming holiday's suggested day —
// and the save goes through the cook's own session, exactly like Settings
// (pickup_windows is on the cook-update allow-list). Past holiday days are
// dropped on the way, so the list tidies itself.
export async function addHolidayPickupDay(formData: FormData) {
  const { cook } = await getCurrentCook();
  if (!cook) redirect("/login?next=/dashboard");

  const date = String(formData.get("date") ?? "");
  const today = pacificTodayIso();
  const holiday = upcomingHolidays(today).find((h) =>
    h.suggestions.includes(date)
  );
  if (!isIsoDate(date) || !holiday || date <= today) {
    redirect("/dashboard?holiday_error=1");
  }

  const windows = activePickupWindows(cook.pickup_windows ?? [], today);
  if (windows.some((w) => datedPickupWindowDate(w, today) === date)) {
    redirect(`/dashboard?holiday=${date}`);
  }
  // Slots when they fit; one line at the usual hours when they don't.
  let lines = holidayPickupLines(holiday!.label, date, windows);
  if (windows.length + lines.length > MAX_PICKUP_LINES) {
    lines = [
      holidayPickupLine(
        holiday!.label,
        date,
        weeklyPickupHours(windows) ?? "time to be confirmed"
      ),
    ];
  }
  if (windows.length + lines.length > MAX_PICKUP_LINES) {
    redirect("/dashboard?holiday_error=full");
  }

  const { error } = await createClient()
    .from("cooks")
    .update({ pickup_windows: [...windows, ...lines] })
    .eq("id", cook.id);
  if (error) {
    console.error("addHolidayPickupDay: update failed", error);
    redirect("/dashboard?holiday_error=1");
  }
  redirect(`/dashboard?holiday=${date}`);
}
