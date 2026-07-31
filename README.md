# ForkFork 🍽️

A marketplace for **county-approved home food operators** — cottage-food bakers and MEHKO home cooks. Launching in Santa Clara County.

Premium positioning: the best home kitchens near you, verified against the county's approved-operator list (not a sketchy Facebook group). Cooks keep 100% of their price; buyers pay a small service fee at checkout.

> **Working on the code (human or AI)?** Start with [`CLAUDE.md`](./CLAUDE.md) — it's the
> orientation doc: architecture, conventions, security model, and the deliberate decisions
> not to undo.

---

## The stack (and what each piece does)

| Piece | Job |
|---|---|
| **Next.js** | The app itself — every page people see and click, plus the server logic behind it. |
| **Supabase** | The backend — database, logins, and photo storage, ready-made. |
| **Stripe** | The money — checkout, the service fee, and **Connect (Express)**: each order auto-pays the cook their full listed price at charge time (test mode for the pilot). |
| **Render** | Hosting — where the app lives on the internet (deploys straight from the GitHub repo). Live at `homeplate-jyd2.onrender.com`. |

---

## The data model (plain English)

Ten tables, and how they connect:

- **profiles** — one row per person, whether they're a buyer or a cook.
- **cooks** — a kitchen's public profile (business name, permit, city, pickup/delivery). Belongs to a profile.
- **cook_private** — a cook's home address + geo, split into an owner-only table for safety (never exposed to buyers).
- **approved_operators** — the county's approved-operator list. *This is the trust hook.* Holds the **real Santa Clara County MEHKO list** (174 permits, imported via `node scripts/import-mehko.mjs` — re-runnable). A cook's permit auto-flags `permit_verified` only if it's on the list and unexpired; the kitchen name is an advisory signal for the human reviewer, and admin approval is the real gate. (Cottage-food list not imported yet — those are reviewed by hand.)
- **listings** — the items a cook sells (title, price, photos, allergens, inventory, an out-of-office toggle). Belong to a cook.
- **orders** — a purchase. Records `subtotal` (the cook keeps 100%), `service_fee` (your 8% + $0.30), `total` (what the buyer pays), and buyer contact.
- **order_items** — the individual lines inside an order.
- **reviews** — a buyer's rating of a kitchen, tied to a real completed order.
- **cook_stripe** — a cook's Stripe Connect account id + onboarding status (service-role only; buyers and even the cook's own session can't read it). The public `cooks.stripe_ready` flag it maintains is what lets a kitchen appear and take orders.
- **payouts** — the legacy log of manual payouts from before Stripe Connect (kept as read-only history).

The full schema with comments is in [`supabase/schema.sql`](./supabase/schema.sql).

---

## Setup (about 15 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Create a free Supabase project
1. Go to [supabase.com](https://supabase.com) → New project.
2. Once it's ready, open **SQL Editor → New query**, paste in everything from `supabase/schema.sql`, and click **Run** — that builds the core tables. Then run the rest of the migrations **in the order listed in** [`supabase/MIGRATIONS.md`](./supabase/MIGRATIONS.md) (they add later columns, the payouts table, and the security policies).
3. Go to **Project Settings → API** and copy your `Project URL`, `anon` key, and `service_role` key.

### 3. Create a free Stripe account
1. Go to [stripe.com](https://stripe.com) and sign up.
2. **Developers → API keys** — copy your publishable and secret keys (use **test mode** while building).
3. Enable **Connect** (Dashboard → Connect → Get started, Express accounts) — cook payouts are automated via destination charges. Webhooks need TWO endpoints at the same URL (platform + connected-account events), each with its own signing secret (`STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET`) — see [`DEPLOY.md`](./DEPLOY.md).

### 4. Add your keys
```bash
cp .env.example .env.local
```
Then open `.env.local` and paste in the keys from steps 2 and 3.

### 5. Run it
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) — you should see the ForkFork landing page.

---

## Opening this in VS Code
**File → Open Folder → ForkFork.** Everything is right here. The terminal inside VS Code (**View → Terminal**) is where you run the `npm` commands above.

---

## Project structure
```
ForkFork/
├── CLAUDE.md             # start-here orientation for any AI/agent
├── app/                  # pages + server logic (App Router)
│   ├── page.tsx          # landing page
│   ├── browse/ kitchen/ listing/ cart/ checkout/ orders/   # buyer flow
│   ├── dashboard/        # cook area (menu, orders, payouts, settings)
│   ├── sell/             # cook onboarding wizard
│   └── admin/            # operator console
├── lib/
│   ├── constants.ts      # the fee rules (8% + $0.30) live here
│   ├── stripe.ts orders.ts email.ts listings.ts ai.ts      # server logic
│   └── supabase/         # database connection helpers
├── components/           # reusable UI pieces
├── supabase/
│   ├── schema.sql        # the database blueprint
│   └── MIGRATIONS.md     # every migration + what's live
├── .env.example          # the list of keys you need
└── package.json
```

---

## What's built so far
- [x] Project skeleton + data model + landing page
- [x] Logins (cook / buyer) + Google OAuth + guest checkout
- [x] Cook side: kitchen profile, permit verification, listings + AI helpers
- [x] Buyer side: browse, kitchen pages, cart
- [x] Checkout (Stripe test mode, 8% + $0.30 fee) + webhook
- [x] Orders, reviews, email notifications, inventory
- [x] Admin console, cook onboarding wizard, payouts view
- [x] Security hardening (incl. a Jul 2026 batch: order-forgery + payout-ledger + checkout-trust fixes) + visual polish
- [x] **Deployed live on Render** — env wired, Stripe webhook verified against the live URL
- [x] Stripe **Connect (Express)** — automated cook payouts via destination charges (test mode; refunds still manual)

**Still to launch (not features):** recruit one real cook · rotate secrets and switch
Stripe from test to live mode. (Real county permit data: ✅ loaded Jul 2026.) See
[`CLAUDE.md`](./CLAUDE.md) and [`PROJECT_REVIEW.md`](./PROJECT_REVIEW.md) for the full picture.

> Note: Stripe **Connect** (Express) is built — checkout uses destination charges, so each
> order automatically routes the cook 100% of their listed price. Still **test mode**;
> refunds remain a manual admin step for the pilot.
