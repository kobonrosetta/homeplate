# HomePlate 🍽️

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
| **Stripe** | The money — checkout and the service fee (test mode for the pilot; cook payouts are manual — Connect isn't built yet). |
| **Render** | Hosting — where the app lives on the internet (deploys straight from the GitHub repo). Live at `homeplate-jyd2.onrender.com`. |

---

## The data model (plain English)

Nine tables, and how they connect:

- **profiles** — one row per person, whether they're a buyer or a cook.
- **cooks** — a kitchen's public profile (business name, permit, city, pickup/delivery). Belongs to a profile.
- **cook_private** — a cook's home address + geo, split into an owner-only table for safety (never exposed to buyers).
- **approved_operators** — the county's approved-operator list. We match a cook's permit against this to flip `permit_verified` to true. *This is the trust hook.* (Currently seeded with sample rows — loading the real Santa Clara County list is a pre-launch task.)
- **listings** — the items a cook sells (title, price, photos, allergens, inventory, an out-of-office toggle). Belong to a cook.
- **orders** — a purchase. Records `subtotal` (the cook keeps 100%), `service_fee` (your 8% + $0.30), `total` (what the buyer pays), and buyer contact.
- **order_items** — the individual lines inside an order.
- **reviews** — a buyer's rating of a kitchen, tied to a real completed order.
- **payouts** — a log of manual payouts to cooks (for the pilot, before Stripe Connect).

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
3. (We'll turn on Stripe Connect for cook payouts in a later step.)

### 4. Add your keys
```bash
cp .env.example .env.local
```
Then open `.env.local` and paste in the keys from steps 2 and 3.

### 5. Run it
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) — you should see the HomePlate landing page.

---

## Opening this in VS Code
**File → Open Folder → HomePlate.** Everything is right here. The terminal inside VS Code (**View → Terminal**) is where you run the `npm` commands above.

---

## Project structure
```
HomePlate/
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

**Still to launch (not features):** load the real Santa Clara County permit data · recruit
one real cook · rotate secrets and switch Stripe from test to live mode. See
[`CLAUDE.md`](./CLAUDE.md) and [`PROJECT_REVIEW.md`](./PROJECT_REVIEW.md) for the full picture.

> Note: Stripe **Connect** (automated cook payouts) isn't built yet — payouts are manual
> for the pilot, and "Checkout" above is plain Stripe in test mode.
