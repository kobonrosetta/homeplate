# ForkFork — Auth email templates (Supabase)

**Two email pipelines exist — don't confuse them:**

1. **Transactional email** (order confirmations, cook notifications, follow
   alerts) is sent by our own code in `lib/email.ts` via the **Resend REST API**,
   from `orders@forkfork.app`. Branded via `wrapEmail()`.
2. **Auth email** (password reset, signup confirmation, magic link, email
   change) is sent by **Supabase itself**, *not* our code. By default Supabase
   uses its own throttled sender (`noreply@mail.app.supabase.io`, ~a few/hour,
   explicitly "not for production"). We route these through **Resend via Custom
   SMTP** so they come from our domain and aren't rate-limited.

This doc is the source of truth for pipeline #2 (the templates + SMTP config).
The templates themselves live in the Supabase dashboard, not in code — paste
from here when they need to change.

## Custom SMTP config

Supabase dashboard → **Authentication → Emails → SMTP Settings** → *Enable custom SMTP*:

| Field | Value |
|-------|-------|
| Sender email address | `hello@forkfork.app` |
| Sender name | `ForkFork` |
| Host | `smtp.resend.com` |
| Port number | `465` |
| Minimum interval per user | `60` seconds |
| Username | `resend` |
| Password | a **dedicated Resend API key** named `supabase-smtp` with **Sending access** only (least-privilege; revocable without touching the app's main key). **Never commit the key.** |

After enabling custom SMTP, raise the auth email rate limit under
**Authentication → Rate Limits** (the tiny default only applied to Supabase's
built-in sender).

`hello@forkfork.app` is a real M365 mailbox; `orders@forkfork.app` is an alias
to it. Both send fine via Resend because `forkfork.app` is a verified Resend
sending domain (DKIM + SPF).

## Templates

Set each under **Authentication → Email Templates** (Subject + HTML body).
Supabase substitutes Go-template variables — the main one is
`{{ .ConfirmationURL }}` (the action link); `{{ .NewEmail }}` is available in the
change-email template. Other vars: `{{ .Token }}`, `{{ .TokenHash }}`,
`{{ .SiteURL }}`, `{{ .Email }}`, `{{ .RedirectTo }}`.

### Reset Password
Subject: `Reset your ForkFork password`

```html
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#292524">
  <div style="font-size:20px;font-weight:700;color:#b45309;margin-bottom:20px">ForkFork</div>
  <h1 style="font-size:19px;font-weight:600;margin:0 0 12px">Reset your password</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px">We got a request to reset the password for your ForkFork account. Tap below to choose a new one — this link expires in about an hour.</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:9px">Reset password</a>
  <p style="font-size:13px;line-height:1.6;color:#78716c;margin:20px 0 0">If you didn't request this, you can safely ignore this email — your password won't change.</p>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e7e5e4;font-size:12px;color:#a8a29e">ForkFork · county-approved home kitchens near you</div>
</div>
```

### Confirm signup
Subject: `Confirm your email for ForkFork`

```html
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#292524">
  <div style="font-size:20px;font-weight:700;color:#b45309;margin-bottom:20px">ForkFork</div>
  <h1 style="font-size:19px;font-weight:600;margin:0 0 12px">Welcome to ForkFork</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px">One tap and you're in — confirm your email to start ordering from county-verified home kitchens near you.</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:9px">Confirm email</a>
  <p style="font-size:13px;line-height:1.6;color:#78716c;margin:20px 0 0">If you didn't create a ForkFork account, you can ignore this email.</p>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e7e5e4;font-size:12px;color:#a8a29e">ForkFork · county-approved home kitchens near you</div>
</div>
```

### Magic Link
Subject: `Your ForkFork sign-in link`

```html
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#292524">
  <div style="font-size:20px;font-weight:700;color:#b45309;margin-bottom:20px">ForkFork</div>
  <h1 style="font-size:19px;font-weight:600;margin:0 0 12px">Your sign-in link</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Tap below to sign in to ForkFork. This link expires in about an hour and can only be used once.</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:9px">Sign in to ForkFork</a>
  <p style="font-size:13px;line-height:1.6;color:#78716c;margin:20px 0 0">Didn't try to sign in? You can safely ignore this email.</p>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e7e5e4;font-size:12px;color:#a8a29e">ForkFork · county-approved home kitchens near you</div>
</div>
```

### Change Email Address
Subject: `Confirm your new email for ForkFork`

```html
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#292524">
  <div style="font-size:20px;font-weight:700;color:#b45309;margin-bottom:20px">ForkFork</div>
  <h1 style="font-size:19px;font-weight:600;margin:0 0 12px">Confirm your new email</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Confirm that <strong>{{ .NewEmail }}</strong> is the new email for your ForkFork account by tapping below.</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:9px">Confirm new email</a>
  <p style="font-size:13px;line-height:1.6;color:#78716c;margin:20px 0 0">If you didn't request this change, ignore this email and your address stays the same.</p>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e7e5e4;font-size:12px;color:#a8a29e">ForkFork · county-approved home kitchens near you</div>
</div>
```
