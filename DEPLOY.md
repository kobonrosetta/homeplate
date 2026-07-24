# Deploying HomePlate to Render

HomePlate's backend (database, auth, storage) lives on **Supabase** and stays exactly where
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

**b) Stripe webhook** — so payments confirm reliably (not just on the success page).
Stripe dashboard → **Developers → Webhooks → Add endpoint**:
- **Endpoint URL:** `https://homeplate-jyd2.onrender.com/api/stripe/webhook`
- **Event to send:** `checkout.session.completed`
- Create it, then copy the **Signing secret** (`whsec_…`).
- Back in Render → your service → **Environment** → set `STRIPE_WEBHOOK_SECRET` to that value → **Save** (Render redeploys automatically).

**c) Resend email (optional for pilot)** — to email anyone besides yourself, verify a sending
domain in Resend and update `EMAIL_FROM` to an address on that domain. Until then, emails
only reach your own Resend account address.

## 5. Test the live loop
On the live URL: sign up → as a cook create a kitchen + a dish (it stays pending until you
approve it at `/admin`) → as a buyer add to cart → check out with a Stripe **test card**
`4242 4242 4242 4242` (any future date, any CVC) → confirm the cook sees the order and the
email arrives.

## ⚠️ Before real customers / real money
- **Rotate every secret.** The keys in `.env.local` were shared in chat. Regenerate the
  Supabase service-role key, Stripe secret key, Groq key, and Resend key; update them in
  **both** Render and your local `.env.local`.
- **Upgrade to the $7/mo instance** so the site never cold-starts.
- **Switch Stripe to live mode** (live keys + a live webhook secret) — separate step; see
  `PROJECT_REVIEW.md` for the payout decision that goes with it.
