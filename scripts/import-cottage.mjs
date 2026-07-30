// Import Santa Clara County's Approved Cottage Food Operations list into
// approved_operators (operation_type = 'cottage'). Mirrors import-mehko.mjs;
// re-runnable (upserts on permit_number). Cottage operators carry the same
// county PT… permit numbers as MEHKO, so cottage cooks auto-verify at signup
// the same way MEHKO cooks do.
//
//   node scripts/import-cottage.mjs            # writes to the DB in .env.local
//   node scripts/import-cottage.mjs --dry-run  # fetch + map + report, NO writes
//
// Requires supabase/add-operator-expiry.sql (migration 19) applied (expires_at
// + the unique index this upserts on). Reads the Supabase URL and SERVICE ROLE
// key from .env.local. County dataset:
//   https://data.sccgov.org/Environment/Approved-Cottage-Food-Operations/fgj3-8svr
import { readFileSync } from "node:fs";

const DATASET = "https://data.sccgov.org/resource/fgj3-8svr.json";
const SOURCE =
  "https://data.sccgov.org/Environment/Approved-Cottage-Food-Operations/fgj3-8svr";
const DRY_RUN = process.argv.includes("--dry-run");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const titleCase = (s) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// County publishes cottage expiry as M/D/YYYY (e.g. "1/31/2027"); the MEHKO
// feed uses YYYYMMDD. Handle both; null if unparseable (lib/match.ts isExpired
// treats null as current, so a blank date never blocks a real operator).
const toDate = (s) => {
  const t = String(s ?? "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  return null;
};

// Page through the whole dataset — Socrata caps an unqualified fetch at 1000.
async function fetchAll() {
  const PAGE = 1000;
  const MAX = 50000;
  const all = [];
  for (let offset = 0; offset < MAX; offset += PAGE) {
    const res = await fetch(`${DATASET}?$limit=${PAGE}&$offset=${offset}&$order=permit_`);
    if (!res.ok) throw new Error(`county API ${res.status} at offset ${offset}`);
    const page = await res.json();
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

async function main() {
  console.log(`Fetching county cottage-food list${DRY_RUN ? " (dry run)" : ""}…`);
  const raw = await fetchAll();

  // Map + dedupe by permit number (last wins). Normalization mirrors
  // lib/match.ts normalizePermit (uppercase, all whitespace stripped) so the
  // signup lookup always hits what we stored.
  const byPermit = new Map();
  for (const r of raw) {
    const permit = (r.permit_ ?? "").toUpperCase().replace(/\s+/g, "");
    const name = (r.facility ?? "").trim();
    if (!permit || !name) continue;
    byPermit.set(permit, {
      permit_number: permit,
      name,
      city: r.city ? titleCase(r.city) : null,
      operation_type: "cottage",
      county: "Santa Clara",
      source_url: SOURCE,
      expires_at: toDate(r.permit_exp__date),
      last_seen_at: new Date().toISOString(),
    });
  }
  const rows = [...byPermit.values()];
  console.log(`  ${raw.length} rows fetched, ${rows.length} unique cottage permits.`);

  // Both programs use PT… numbers and we upsert on permit_number, so a shared
  // number would flip an existing MEHKO row to cottage. Exclude any collisions
  // (leave them as MEHKO) and report them for manual review.
  const existing = await fetch(
    `${URL_}/rest/v1/approved_operators?operation_type=eq.mehko&select=permit_number`,
    { headers: H }
  );
  const mehkoSet = new Set(
    existing.ok ? (await existing.json()).map((r) => r.permit_number) : []
  );
  const collisions = rows.filter((r) => mehkoSet.has(r.permit_number));
  const safe = rows.filter((r) => !mehkoSet.has(r.permit_number));
  if (collisions.length) {
    console.log(
      `  ⚠ ${collisions.length} permit(s) already loaded as MEHKO — EXCLUDED so they stay MEHKO: ${collisions
        .map((r) => r.permit_number)
        .join(", ")}`
    );
  }
  const noExpiry = safe.filter((r) => !r.expires_at).length;
  console.log(`  ${noExpiry} of ${safe.length} to load have no parseable expiry (treated as current).`);

  if (DRY_RUN) {
    console.log(`  (dry run — nothing written.) Would upsert ${safe.length} cottage rows. Sample:`);
    for (const r of safe.slice(0, 6)) {
      console.log(`    ${r.permit_number}  ${r.name}  ·  ${r.city ?? "?"}  ·  exp ${r.expires_at ?? "none"}`);
    }
    return;
  }

  // Upsert on permit_number (unique index from migration 19).
  const up = await fetch(
    `${URL_}/rest/v1/approved_operators?on_conflict=permit_number`,
    {
      method: "POST",
      headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(safe),
    }
  );
  const upBody = await up.text();
  if (!up.ok) throw new Error(`upsert failed ${up.status}: ${upBody}`);
  console.log(`  Upserted ${JSON.parse(upBody).length} cottage operators.`);

  // Remove any lingering fake demo seed rows (MEHKO-2025-* / CFO-2025-*).
  const del = await fetch(
    `${URL_}/rest/v1/approved_operators?permit_number=like.*2025-*`,
    { method: "DELETE", headers: { ...H, Prefer: "return=representation" } }
  );
  const delBody = await del.text();
  if (del.ok) {
    const removed = JSON.parse(delBody);
    console.log(`  Removed ${removed.length} fake seed rows${removed.length ? ": " + removed.map((r) => r.permit_number).join(", ") : ""}.`);
  } else {
    console.log(`  (Could not remove seed rows: ${del.status} ${delBody})`);
  }

  // Verify.
  const count = await fetch(
    `${URL_}/rest/v1/approved_operators?operation_type=eq.cottage&select=count`,
    { headers: { ...H, Prefer: "count=exact" } }
  );
  console.log(`  approved_operators now holds ${(await count.json())[0]?.count} cottage rows.`);
  console.log("Done.");
}

main().catch((e) => {
  console.error("Import failed:", e.message);
  process.exit(1);
});
