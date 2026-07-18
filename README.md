# HomePlate 🍽️

A marketplace for **county-approved home food operators** — cottage-food bakers and MEHKO home cooks. Launching in Santa Clara County.

Premium positioning: the best home kitchens near you, verified against the county's approved-operator list (not a sketchy Facebook group). Cooks keep 100% of their price; buyers pay a small service fee at checkout.

---

## The stack (and what each piece does)

| Piece | Job |
|---|---|
| **Next.js** | The app itself — every page people see and click, plus the server logic behind it. |
| **Supabase** | The backend — database, logins, and photo storage, ready-made. |
| **Stripe** | The money — checkout, cook payouts, and the service fee. |
| **Render** | Hosting — where the app lives on the internet (free while you build). |

---

## The data model (plain English)

Seven tables, and how they connect:

- **profiles** — one row per person, whether they're a buyer or a cook.
- **cooks** — a kitchen's profile (business name, permit, city, pickup/delivery). Belongs to a profile.
- **approved_operators** — the county's public approved list, refreshed daily. We match a cook's permit against this to flip `permit_verified` to true. *This is the trust hook.*
- **listings** — the items a cook sells (title, price, photo, inventory, an out-of-office toggle). Belong to a cook.
- **orders** — a purchase. Records `subtotal` (the cook keeps 100%), `service_fee` (your 8% + $0.30), and `total` (what the buyer pays).
- **order_items** — the individual lines inside an order.
- **reviews** — a buyer's rating of a kitchen, tied to a real order.

The full schema with comments is in [`supabase/schema.sql`](./supabase/schema.sql).

---

## Setup (about 15 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Create a free Supabase project
1. Go to [supabase.com](https://supabase.com) → New project.
2. Once it's ready, open **SQL Editor → New query**, paste in everything from `supabase/schema.sql`, and click **Run**. That builds all your tables.
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
├── app/                  # pages (what users see)
│   ├── layout.tsx        # wraps every page
│   ├── page.tsx          # the landing page
│   └── globals.css
├── lib/
│   ├── constants.ts      # the fee rules (8% + $0.30) live here
│   └── supabase/         # database connection helpers
├── supabase/
│   └── schema.sql        # the database blueprint
├── .env.example          # the list of keys you need
└── package.json
```

---

## What's built so far
- [x] Project skeleton + data model + landing page
- [ ] Logins (cook / buyer)
- [ ] Cook side: kitchen profile, permit verification, listings + AI helpers
- [ ] Buyer side: browse, kitchen pages, cart
- [ ] Checkout (Stripe Connect, 8% + $0.30 fee)
- [ ] Orders, reviews, notifications
- [ ] Deploy to Render
