"use server";

import { createAdminClient } from "@/lib/supabase/admin";

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
    const { error } = await db
      .from("waitlist")
      .upsert({ email, zip, city: null, source }, {
        onConflict: "email",
        ignoreDuplicates: true,
      });
    if (error) return { ok: false, error: "Something went wrong. Try again." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
