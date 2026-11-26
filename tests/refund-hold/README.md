# Refund-hold checks

Two scripts that exercise the refund hold (migration 45) for real, without
touching Supabase, Stripe or Resend. Run them before changing
`lib/refunds.ts`, `lib/refund-hold.ts`, `app/api/cron/refund-cancelled`, or
anything in `supabase/` that touches the `orders` triggers.

They need an in-process Postgres that is deliberately **not** a project
dependency. Install it for the session, then run both:

```bash
npm install --no-save @electric-sql/pglite
npx tsx tests/refund-hold/migration.test.mjs
npx tsx --tsconfig tests/refund-hold/tsconfig.json tests/refund-hold/refunds.test.mjs
```

- **`migration.test.mjs`** loads the production order guard (migrations 16 and
  18) and `supabase/add-order-refund-hold.sql` **verbatim** from this repo
  into a real Postgres engine and checks what the hold depends on: a cook's
  cancel stamps `cancelled_at`, a cook session cannot forge any of the money
  columns, the trigger order holds, a refund claim and an "undo cancel" are
  mutually exclusive, the file is safe to re-run, and the sweep's queries
  pick exactly the right orders.
- **`refunds.test.mjs`** runs the real `lib/refunds.ts` and the real sweep
  route against that Postgres. Only three things are stand-ins (`mocks/`):
  the service-role client, Stripe (each test scripts its answer) and email
  (recorded). It covers the cook's "Refund now" and "Undo cancel", every
  refusal, Stripe saying no / not answering / "already refunded", an undo
  arriving while Stripe is working, the scheduled sweep, and the fallback
  when migration 45 has not been run.

`npm test` (the unit tests) covers the pure hold rules in
`lib/refund-hold.ts` and needs none of this.
