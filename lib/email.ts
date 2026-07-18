// Transactional email via Resend's REST API. Key-safe: with no RESEND_API_KEY
// every call is a silent no-op, so a missing key never breaks the main flow.
const RESEND_API = "https://api.resend.com/emails";

function apiKey(): string | null {
  const k = process.env.RESEND_API_KEY;
  return k && k.startsWith("re_") ? k : null;
}

const FROM = process.env.EMAIL_FROM || "HomePlate <onboarding@resend.dev>";

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = apiKey();
  const to = Array.isArray(opts.to) ? opts.to.filter(Boolean) : opts.to;
  if (!key || !to || (Array.isArray(to) && to.length === 0)) return false;
  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Minimal branded wrapper so emails aren't raw text.
export function wrapEmail(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#292524">
    <div style="font-size:18px;font-weight:600;color:#b45309;margin-bottom:12px">HomePlate</div>
    <div style="font-size:15px;line-height:1.6">${bodyHtml}</div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e7e5e4;font-size:12px;color:#a8a29e">HomePlate · county-approved home kitchens</div>
  </div>`;
}
