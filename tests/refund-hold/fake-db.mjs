// A stand-in database for the refund-hold tests (see README.md): a real
// Postgres engine (PGlite) carrying the production order guard and — when
// asked — migration 45, both read verbatim from supabase/, plus a small
// Supabase-shaped query builder over it.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const read = (f) =>
  readFileSync(new URL(`../../supabase/${f}`, import.meta.url), "utf8");
const g = globalThis;

// The query builder supports exactly the calls the code under test makes;
// anything else throws, so a new kind of query can't pass silently untested.
//   role   run every statement as this Postgres role ("authenticated" for a
//          cook's session, so the guard and triggers behave as in production)
// Test hooks (all optional, on globalThis):
//   __failWrite(sql)  return an error object to make that statement fail
//                     WITHOUT running, as a database outage would
//   __jitter          wait a random moment before each statement, to shuffle
//                     how concurrent calls interleave
export function fakeClient(db, { role } = {}) {
  const iso = (row) =>
    row &&
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])
    );
  // Real PostgREST checks an UPDATE's payload against its schema cache and
  // answers PGRST204 for an unknown column, before Postgres ever sees it.
  const asPostgrest = (e, table) => {
    const m = /column "([a-z_]+)" of relation "[a-z_]+" does not exist/.exec(e.message ?? "");
    if (e.code === "42703" && m)
      return { code: "PGRST204", message: `Could not find the '${m[1]}' column of '${table}' in the schema cache` };
    return { code: e.code, message: e.message };
  };
  class Q {
    constructor(table) {
      this.table = table;
      this.op = "select";
      this.cols = "*";
      this.returning = null;
      this.payload = null;
      this.where = [];
      this.params = [];
      this.single = false;
      this.tail = "";
    }
    p(v) {
      this.params.push(v);
      return `$${this.params.length}`;
    }
    select(cols = "*") {
      if (this.op === "select") this.cols = cols;
      else this.returning = cols;
      return this;
    }
    update(obj) {
      this.op = "update";
      this.payload = obj;
      return this;
    }
    eq(c, v) {
      this.where.push(`${c} = ${this.p(v)}`);
      return this;
    }
    lt(c, v) {
      this.where.push(`${c} < ${this.p(v)}`);
      return this;
    }
    lte(c, v) {
      this.where.push(`${c} <= ${this.p(v)}`);
      return this;
    }
    is(c, v) {
      if (v !== null) throw new Error("fake client: is() only supports null");
      this.where.push(`${c} is null`);
      return this;
    }
    not(c, op, v) {
      if (op !== "is" || v !== null) throw new Error("fake client: only not(col, 'is', null)");
      this.where.push(`${c} is not null`);
      return this;
    }
    in(c, vs) {
      this.where.push(`${c}::text = any(${this.p(vs)}::text[])`);
      return this;
    }
    order(c, o = {}) {
      this.tail += ` order by ${c} ${o.ascending === false ? "desc" : "asc"}`;
      return this;
    }
    limit(n) {
      this.tail += ` limit ${Number(n)}`;
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    async run() {
      let sql;
      if (this.op === "update") {
        const sets = Object.entries(this.payload).map(
          ([k, v]) => `${k} = ${v === null ? "null" : this.p(v)}`
        );
        sql = `update ${this.table} set ${sets.join(", ")}`;
      } else sql = `select ${this.cols} from ${this.table}`;
      if (this.where.length) sql += ` where ${this.where.join(" and ")}`;
      if (this.op === "update" && this.returning) sql += ` returning ${this.returning}`;
      if (this.op === "select") sql += this.tail;
      if (g.__jitter) await new Promise((r) => setTimeout(r, Math.random() * 4));
      const injected = g.__failWrite?.(sql);
      if (injected) return { data: null, error: injected };
      try {
        let r;
        if (role) {
          // set role / statement / reset role must not interleave with
          // another caller's statements: serialize them on the db.
          r = await (db.__chain = (db.__chain ?? Promise.resolve()).then(async () => {
            await db.exec(`set role ${role}`);
            try {
              return { ok: await db.query(sql, this.params) };
            } catch (e) {
              return { err: e };
            } finally {
              await db.exec("reset role");
            }
          }));
          if (r.err) throw r.err;
          r = r.ok;
        } else {
          r = await (db.__chain = (db.__chain ?? Promise.resolve()).then(() =>
            db.query(sql, this.params).then((ok) => ({ ok }), (err) => ({ err }))
          ));
          if (r.err) throw r.err;
          r = r.ok;
        }
        const rows = r.rows.map(iso);
        if (this.op === "update" && !this.returning) return { data: null, error: null };
        return { data: this.single ? rows[0] ?? null : rows, error: null };
      } catch (e) {
        return { data: null, error: asPostgrest(e, this.table) };
      }
    }
    then(res, rej) {
      return this.run().then(res, rej);
    }
  }
  return {
    from: (t) => new Q(t),
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  };
}

// A fresh world: roles, tables, the production guard, optionally migration
// 45, one kitchen with a limited-stock dish, and helpers to place orders.
export async function makeWorld(migrated) {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create type order_status as enum ('pending','confirmed','in_progress','ready','completed','cancelled');
    create table cooks (id uuid primary key default gen_random_uuid(), business_name text);
    create table listings (id uuid primary key default gen_random_uuid(), cook_id uuid, limited_quantity boolean default false, quantity_available integer default 0);
    create table orders (
      id uuid primary key default gen_random_uuid(),
      buyer_id uuid, cook_id uuid,
      status order_status not null default 'pending',
      fulfillment text default 'pickup', subtotal_cents integer, service_fee_cents integer, total_cents integer,
      stripe_payment_intent_id text, pickup_time text, notes text,
      contact_name text, contact_phone text, contact_email text, delivery_address text,
      ready_by_date date, event_date date, custom_request_id uuid,
      reminder_sent_at timestamptz, refunded_at timestamptz,
      created_at timestamptz not null default now()
    );
    create table order_items (id uuid primary key default gen_random_uuid(), order_id uuid, listing_id uuid, quantity integer);
    grant all on orders, cooks, listings, order_items to authenticated, anon, service_role;
  `);
  const inProgress = read("add-order-in-progress.sql");
  await db.exec(
    inProgress.slice(inProgress.indexOf("create or replace function public.enforce_order_update_rules()"))
  );
  const harden = read("harden-orders.sql");
  const a = harden.indexOf("drop trigger if exists orders_guard_update on orders;");
  await db.exec(harden.slice(a, harden.indexOf(";", harden.indexOf("create trigger orders_guard_update")) + 1));
  if (migrated) await db.exec(read("add-order-refund-hold.sql"));

  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const kitchen = (await one("insert into cooks (business_name) values ('40 Acres Test Kitchen') returning id")).id;
  const other = (await one("insert into cooks (business_name) values ('Someone Else') returning id")).id;
  // Plenty of stock: the real code clamps the shelf at zero, which would
  // muddy the arithmetic these checks do.
  const listing = (
    await one("insert into listings (cook_id, limited_quantity, quantity_available) values ($1, true, 1000) returning id", [kitchen])
  ).id;
  // A paid order for 2 of the limited dish; stock already taken at payment.
  const paidOrder = async (status = "confirmed", cookId = kitchen) => {
    const id = (
      await one(
        `insert into orders (cook_id, status, subtotal_cents, service_fee_cents, total_cents, stripe_payment_intent_id, contact_name, contact_email)
         values ($1, $2, 3600, 318, 3918, 'pi_' || substr(gen_random_uuid()::text, 1, 8), 'Theresa', 'buyer@example.com') returning id`,
        [cookId, status]
      )
    ).id;
    await db.query("insert into order_items (order_id, listing_id, quantity) values ($1, $2, 2)", [id, listing]);
    await db.query("update listings set quantity_available = quantity_available - 2 where id = $1", [listing]);
    return id;
  };
  // What the cook's Cancel button does at the database: a status change from
  // THEIR session (so the production guard runs), then the action restocks.
  const cookCancels = async (id) => {
    await db.exec("set role authenticated");
    try {
      await db.query("update orders set status = 'cancelled' where id = $1", [id]);
    } finally {
      await db.exec("reset role");
    }
    await db.query("update listings set quantity_available = quantity_available + 2 where id = $1", [listing]);
  };
  const order = (id) => one("select * from orders where id = $1", [id]);
  const stock = async () => (await one("select quantity_available as q from listings where id = $1", [listing])).q;
  return { db, kitchen, other, paidOrder, cookCancels, order, stock };
}

// Point the code under test at this world and reset what the stand-ins
// recorded. Stripe says yes unless a test scripts otherwise.
export function install(db) {
  g.__fakeDb = fakeClient(db);
  g.__sessionDb = fakeClient(db, { role: "authenticated" });
  g.__emails = [];
  g.__stripeCalls = [];
  g.__stripe = async () => ({ id: "re_ok" });
  g.__failWrite = null;
  g.__jitter = false;
}
export const emailsTo = (to) =>
  g.__emails.filter((e) => e.to === to || (Array.isArray(e.to) && e.to.includes(to))).map((e) => e.subject);

// A tiny PASS/FAIL recorder shared by the test files.
export function reporter() {
  const out = [];
  let failed = 0;
  return {
    ok(c, label, d = "") {
      if (!c) failed++;
      out.push(`${c ? "PASS" : "FAIL"}  ${label}${d ? "  — " + d : ""}`);
    },
    finish() {
      console.log(out.join("\n"));
      console.log(`\n${out.length - failed} passed, ${failed} failed`);
      process.exit(failed ? 1 : 0);
    },
  };
}
