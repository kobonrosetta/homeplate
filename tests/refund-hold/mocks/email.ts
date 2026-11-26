// Test stand-in for lib/email.ts (see ../README.md): records what would have
// been sent instead of calling Resend.
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  (globalThis as any).__emails.push({ kind: "email", ...opts });
  return true;
}

export async function notifyAdmins(
  subject: string,
  bodyHtml: string
): Promise<void> {
  (globalThis as any).__emails.push({
    kind: "admin",
    to: "admins",
    subject,
    html: bodyHtml,
  });
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wrapEmail(bodyHtml: string): string {
  return bodyHtml;
}
