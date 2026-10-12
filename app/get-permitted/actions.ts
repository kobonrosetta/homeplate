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
