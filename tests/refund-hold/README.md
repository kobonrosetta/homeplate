# Refund-hold checks

Three scripts that exercise the refund hold (migration 45) for real, without
touching Supabase, Stripe or Resend. Run them before changing
`lib/refunds.ts`, `lib/refund-hold.ts`, `app/dashboard/orders/actions.ts`,
`app/api/cron/refund-cancelled`, or anything in `supabase/` that touches the
`orders` triggers.

They need an in-process Postgres that is deliberately **not** a project
dependency. Install it for the session, then run all three:

```bash
npm install --no-save @electric-sql/pglite
npx tsx tests/refund-hold/migration.test.mjs
npx tsx --tsconfig tests/refund-hold/tsconfig.json tests/refund-hold/refunds.test.mjs
npx tsx --tsconfig tests/refund-hold/tsconfig.json tests/refund-hold/actions.test.mjs
```

- **`migration.test.mjs`** loads the production order guard (migrations 16 and
  18) and `supabase/add-order-refund-hold.sql` **verbatim** from this repo
  into a real Postgres engine and checks what the hold depends on: a cook's
  cancel stamps `cancelled_at`, a cook session cannot forge any of the money
  columns, the trigger order holds, a refund claim and an "undo cancel" are
  mutually exclusive, the file is safe to re-run, and the sweep's queries
  pick exactly the right orders.
- **`refunds.test.mjs`** runs the real `lib/refunds.ts` and the real sweep
  route against that Postgres. It covers "Refund now" and "Undo cancel",
  every refusal, Stripe saying no / not answering / "already refunded", an
  undo arriving while Stripe is working (and 60 shuffled undo/refund pairs),
  the database failing at each step, the sweep (expired holds, stuck refunds
  on any order, back-off after a failure, two sweeps at once), and the
  fallback when migration 45 has not been run.
- **`actions.test.mjs`** runs the cook's real server actions: cancel, "Refund
  now", "Undo cancel". It checks who may press them and what the buyer, the
  cook and the admins are each emailed, with and without the migration.

What is real and what is a stand-in: the code under test and the SQL are the
real files. `fake-db.mjs` provides the Postgres and a small Supabase-shaped
query builder over it (the cook's statements run as the `authenticated` role,
so the guard and triggers apply). `mocks/` replaces the service-role client,
the session client, "who is signed in", Stripe (each test scripts its
answer), email (recorded), and Next's `redirect` / `revalidatePath`. The
`--tsconfig` flag is what swaps them in.

`npm test` (the unit tests) covers the pure hold rules in
`lib/refund-hold.ts` and how `lib/stripe.ts createRefund` classifies Stripe's
answers, and needs none of this.
