"use server";

import { redirect } from "next/navigation";
import { escapeHtml, notifyAdmins } from "@/lib/email";

// Lead capture for cooks who DON'T have a county permit yet — the people the
// sell-wizard gate routes here instead of into the approval queue. The lead
// lands in Kobon's inbox (ADMIN_EMAILS), where cook outreach already happens;
// no database table, no admin UI, no pending-queue pollution.
//
// This is an unauthenticated email-sending endpoint, so it's deliberately
// paranoid: a hidden honeypot field silently swallows bots, every field is
// length-capped and HTML-escaped, and a lead needs a name plus at least one
// way to reach them.
// In-memory dedupe + coarse throttle. Resets on deploy/restart — that's
// acceptable as a belt: it stops a curl loop from re-emailing the same lead
// endlessly and caps total sends per hour so lead spam can't burn the Resend
// quota that order emails ride on. The durable fix (a cook_leads table as
// system of record, email as best-effort ping — the joinWaitlist pattern)
// needs a hand-run migration and is tracked separately.
const seenLeads = new Map<string, number>();
let windowStart = 0;
let windowSends = 0;
const LEAD_TTL_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const WINDOW_MAX = 20;

export async function submitCookLead(formData: FormData) {
  const trap = String(formData.get("website") ?? "");
  // Newlines stripped: `name` goes into an email SUBJECT — never let a form
  // value smuggle line breaks toward header territory, whatever the API.
  const name = String(formData.get("name") ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 120);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 40);
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const cooks = String(formData.get("what_you_cook") ?? "")
    .trim()
    .slice(0, 500);

  // Honeypot filled → a bot. Pretend success; send nothing.
  if (trap) redirect("/get-permitted?sent=1");

  if (!name || (!phone && !email)) {
    redirect(
      "/get-permitted?error=" +
        encodeURIComponent("Add your name and a phone number or email.")
    );
  }

  // Same contact within 24h, or more than WINDOW_MAX leads this hour →
  // pretend success without sending (the lead saw the form; a human retry
  // tomorrow still works, and admins aren't floodable).
  const key = `${email.toLowerCase()}|${phone}`;
  const now = Date.now();
  const last = seenLeads.get(key);
  if (last && now - last < LEAD_TTL_MS) redirect("/get-permitted?sent=1");
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowSends = 0;
  }
  if (windowSends >= WINDOW_MAX) redirect("/get-permitted?sent=1");
  seenLeads.set(key, now);
  windowSends++;
  if (seenLeads.size > 1000) {
    for (const [k, t] of seenLeads) if (now - t > LEAD_TTL_MS) seenLeads.delete(k);
  }

  await notifyAdmins(
    `Cook lead (not yet permitted): ${name}`,
    `<h2>Someone wants to cook on ForkFork — no permit yet</h2>
     <p><strong>${escapeHtml(name)}</strong></p>
     <p>${phone ? `Phone: ${escapeHtml(phone)}<br/>` : ""}${
       email ? `Email: ${escapeHtml(email)}` : ""
     }</p>
     ${cooks ? `<p>What they cook: ${escapeHtml(cooks)}</p>` : ""}
     <p>They came through the /get-permitted page (the sell-wizard permit
     gate). Playbook: reach out, point them at the county MEHKO/cottage
     application, and check the weekly permit refresh for their name in a few
     weeks.</p>`
  );

  redirect("/get-permitted?sent=1");
}
