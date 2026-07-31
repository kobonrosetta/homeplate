# Deploying ForkFork to Render

ForkFork's backend (database, auth, storage) lives on **Supabase** and stays exactly where
it is. This guide only puts the **Next.js app** online, hosted on **Render**, deploying from
the GitHub repo `kobonrosetta/homeplate`.

> **Free-tier note:** a free Render web service sleeps after 15 min of inactivity and takes
> ~30–60s to wake on the next visit. Fine for a pilot — upgrade to the $7/mo instance for
> always-on before a public launch.

> **This deployment is live at:** **https://homeplate-jyd2.onrender.com**
> (Render appended `-jyd2` for uniqueness — the plain `homeplate.onrender.com` is
> not this app.) The concrete URLs in the steps below already use the live one.

## Before you start
- Code is pushed to GitHub ✅
- A Render account — sign up at [render.com](https://render.com) with your GitHub (free)
- Your `.env.local` open in front of you — you'll copy these values into Render

## 1. Create the web service
1. Render dashboard → **New +** → **Web Service**.
2. **Connect GitHub** and pick the **`kobonrosetta/homeplate`** repo (approve access if asked).
3. Fill in the settings:
   - **Name:** `homeplate`  → becomes your URL; Render may append a suffix for
     uniqueness (this deploy became `homeplate-jyd2.onrender.com`)
   - **Region:** closest to you (e.g. Oregon for the West Coast)
   - **Branch:** `main`
   - **Runtime / Language:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Instance type:** **Free**

## 2. Add your environment variables
Scroll to **Environment Variables**. Add **every** key from your `.env.local` (tip: use
**Add from .env** and paste the whole file), then set these two correctly:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | same as local |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as local |
| `SUPABASE_SERVICE_ROLE_KEY` | same as local |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | same as local |
| `STRIPE_SECRET_KEY` | same as local |
| `STRIPE_WEBHOOK_SECRET` | **leave blank for now** — you set it in step 4b |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | **leave blank for now** — you set it in step 4b (second endpoint) |
| `GROQ_API_KEY` | same as local |
| `RESEND_API_KEY` | same as local |
| `EMAIL_FROM` | same as local for now |
| `ADMIN_EMAILS` | your email — so you can reach `/admin` |
| `NEXT_PUBLIC_SITE_URL` | **`https://homeplate-jyd2.onrender.com`** (your live Render URL, *not* localhost) |

> `NEXT_PUBLIC_*` values are baked in at **build time**, so set them **before** you deploy.
> Change one later and you must trigger a fresh deploy for it to take effect.

## 3. Deploy
Click **Create Web Service**. Render installs, builds, and boots the app (first build ~3–5
min). You'll get your URL (this deploy's is `https://homeplate-jyd2.onrender.com`) — open
it, you should see the landing page.

> - Build fails on a Node version error? Add env var `NODE_VERSION` = `20` and redeploy.
> - Page won't load/bind? Set **Start command** to `npx next start -p $PORT -H 0.0.0.0`.

## 4. Wire up the live URL (once you have the Render URL)

**a) Supabase auth redirects** — so login works on the live site.
Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL:** `https://homeplate-jyd2.onrender.com`
- **Redirect URLs:** add `https://homeplate-jyd2.onrender.com/**`

**b) Stripe webhooks — TWO endpoints at the same URL.** A Stripe endpoint delivers
*either* your-account events *or* connected-account events, never both — so payment
confirmation and cook payout-status sync each need their own endpoint (and each
endpoint has its own signing secret).

Endpoint 1 — payments (events on **your account**):
- Stripe dashboard → **Developers → Webhooks → Add endpoint**
- **Endpoint URL:** `https://homeplate-jyd2.onrender.com/api/stripe/webhook`
- **Events:** `checkout.session.completed`
- Copy its **Signing secret** (`whsec_…`) → Render env `STRIPE_WEBHOOK_SECRET`.

Endpoint 2 — cook payouts (events on **Connected accounts** — pick that option
when creating the endpoint):
- Same **Endpoint URL** as above.
- **Events:** `account.updated`, `account.application.deauthorized`
- Copy **its** signing secret (a different `whsec_…`) → Render env
  `STRIPE_CONNECT_WEBHOOK_SECRET`.

(Also enable **Connect** itself once per Stripe account: Dashboard → Connect →
Get started, Express accounts. Saving either env var redeploys the service.)

**c) Resend email** — ✅ done (Jul 2026): `forkfork.app` is a verified Resend sending
domain and `EMAIL_FROM` is `ForkFork <orders@forkfork.app>` (replies alias to
`hello@forkfork.app`), so transactional email reaches real users. On a fresh setup you'd
verify a sending domain in Resend and set `EMAIL_FROM` to an address on it.

## 5. Test the live loop
On the live URL: sign up → as a cook create a kitchen + a dish (it stays pending until you
approve it at `/admin`) → **as the cook, open `/dashboard/payouts` → "Set up payouts with
Stripe" and complete Stripe's test-mode Express onboarding** (test SSN `000-00-0000`,
routing `110000000`, account `000123456789`) — the kitchen only appears in browse once
payouts are active → as a buyer add to cart → check out with a Stripe **test card**
`4242 4242 4242 4242` (any future date, any CVC) → confirm the cook sees the order, the
email arrives, and in the Stripe test dashboard the payment shows the application fee with
the cook's subtotal transferred to their connected account.

## ⚠️ Before real customers / real money
- **Rotate every secret.** The keys in `.env.local` were shared in chat. Regenerate the
  Supabase service-role key, Stripe secret key, Groq key, and Resend key; update them in
  **both** Render and your local `.env.local`.
- **Upgrade to the $7/mo instance** so the site never cold-starts.
- **Switch Stripe to live mode:** live keys, **both** live webhook endpoints re-created in
  live mode (step 4b — each with its new signing secret), Connect enabled in live mode,
  and your first real cook completes real Express onboarding (actual SSN + bank).
  Refunds are still a manual admin step — reverse the transfer + refund the application
  fee (the admin cancellation email spells it out).
