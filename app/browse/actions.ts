"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdmins, escapeHtml } from "@/lib/email";

// Where a waitlist signup can come from. Server-whitelisted so a crafted POST
// can't stuff arbitrary text into the `source` column.
const SOURCES = new Set(["browse", "home", "kitchen"]);

export type WaitlistState = { ok: boolean; error?: string };

// Very light email shape check — we're not verifying deliverability, just
// rejecting obvious junk before it lands in the list.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Join the buyer waitlist. Writes via the SERVICE ROLE — the `waitlist` table
// has RLS on with zero policies, so end-user sessions can't read or write it
// (see supabase/add-waitlist.sql). Returns a small state object for useFormState.
export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData
): Promise<WaitlistState> {
  // Honeypot: a hidden field real users never fill. If a bot fills it, pretend
  // success and drop the write silently.
  if (String(formData.get("company") ?? "").trim() !== "") {
    return { ok: true };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  // Optional zip: keep digits only, first 5. Stored null when absent.
  const zipDigits = String(formData.get("zip") ?? "").replace(/\D/g, "");
  const zip = zipDigits ? zipDigits.slice(0, 5) : null;

  const rawSource = String(formData.get("source") ?? "browse");
  const source = SOURCES.has(rawSource) ? rawSource : "browse";

  try {
    const db = createAdminClient();
    // ON CONFLICT DO NOTHING via ignoreDuplicates — a re-submit of the same
    // email is an idempotent success (keeps the first zip), not an error.
    // .select() returns the row ONLY on a genuine insert (empty on a duplicate),
    // so the admin ping below fires on new signups, never on re-submits.
    const { data: inserted, error } = await db
      .from("waitlist")
      .upsert({ email, zip, city: null, source }, {
        onConflict: "email",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) return { ok: false, error: "Something went wrong. Try again." };

    if (inserted && inserted.length > 0) {
      // Best-effort admin ping with running totals. Fire-and-forget (Render runs
      // a persistent Node process, like the captureServer analytics) so the two
      // count round-trips + the email send never delay the visitor's response.
      void (async () => {
        try {
          const { count: total } = await db
            .from("waitlist")
            .select("id", { count: "exact", head: true });
          let inZip: number | null = null;
          if (zip) {
            const { count } = await db
              .from("waitlist")
              .select("id", { count: "exact", head: true })
              .eq("zip", zip);
            inZip = count ?? null;
          }
          await notifyAdmins(
            `New waitlist signup${zip ? ` — ZIP ${zip}` : ""} 🎉`,
            `<h2>New waitlist signup</h2>
             <p><strong>${escapeHtml(email)}</strong>${
               zip ? ` · ZIP ${escapeHtml(zip)}` : " · no ZIP given"
             }</p>
             <p>${total ?? "?"} on the waitlist now${
               zip && inZip ? ` · ${inZip} in ${escapeHtml(zip)}` : ""
             }.</p>`
          );
        } catch {
          /* best-effort */
        }
      })();
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
