// Import Santa Clara County's MEHKO (Microenterprise Home Kitchen) permit list
// into approved_operators. Re-runnable: upserts on permit_number, so running it
// again refreshes names / expiry / city for existing permits and adds new ones.
//
//   node scripts/import-mehko.mjs
//
// Requires supabase/add-operator-expiry.sql (migration 19) to be applied first
// (adds expires_at + the unique index this upserts on). Reads the Supabase URL
// and SERVICE ROLE key from .env.local.
import { readFileSync } from "node:fs";

const DATASET = "https://data.sccgov.org/resource/um9j-d9mm.json";
const SOURCE = "https://data.sccgov.org/Environment/Microenterprise-Home-Kitchens-MEHKOs/um9j-d9mm";

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

// "20260930" -> "2026-09-30"; anything unparseable -> null.
const toDate = (s) =>
  /^\d{8}$/.test(s ?? "") ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;

// Page through the whole dataset rather than trusting a single request — the
// Socrata resource caps an unqualified fetch at 1000 rows, so an explicit
// $limit/$offset loop is the only way this stays correct if the county list
// grows past that. Stops when a page comes back short.
async function fetchAll() {
  const PAGE = 1000;
  const MAX = 50000; // sanity backstop against a runaway loop
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
  console.log("Fetching county MEHKO list…");
  const raw = await fetchAll();

  // Map + dedupe by permit number (last one wins). Normalization must mirror
  // lib/match.ts normalizePermit (uppercase, ALL whitespace stripped) so the
  // signup lookup always hits what the importer stored.
  const byPermit = new Map();
  for (const r of raw) {
    const permit = (r.permit_ ?? "").toUpperCase().replace(/\s+/g, "");
    const name = (r.facility ?? "").trim();
    if (!permit || !name) continue;
    byPermit.set(permit, {
      permit_number: permit,
      name,
      city: r.city ? titleCase(r.city) : null,
      operation_type: "mehko",
      county: "Santa Clara",
      source_url: SOURCE,
      expires_at: toDate(r.permit_exp__date),
      last_seen_at: new Date().toISOString(),
    });
  }
  const rows = [...byPermit.values()];
  console.log(`  ${raw.length} rows fetched, ${rows.length} unique permits.`);

  // Upsert on permit_number (unique index from migration 19).
  const up = await fetch(
    `${URL_}/rest/v1/approved_operators?on_conflict=permit_number`,
    {
      method: "POST",
      headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(rows),
    }
  );
  const upBody = await up.text();
  if (!up.ok) throw new Error(`upsert failed ${up.status}: ${upBody}`);
  console.log(`  Upserted ${JSON.parse(upBody).length} operators.`);

  // Remove the fake demo seed rows (permit numbers like MEHKO-2025-* / CFO-2025-*)
  // so nobody can verify against them now that real data is live.
  const del = await fetch(
    `${URL_}/rest/v1/approved_operators?permit_number=like.*2025-*`,
    { method: "DELETE", headers: { ...H, Prefer: "return=representation" } }
  );
  const delBody = await del.text();
  if (del.ok) {
    const removed = JSON.parse(delBody);
    console.log(`  Removed ${removed.length} fake seed rows${removed.length ? ": " + removed.map((r) => r.permit_number).join(", ") : ""}.`);
  } else {
    console.log(`  (Could not remove seed rows: ${del.status} ${delBody} — likely FK-referenced; leave them or clean up by hand.)`);
  }

  // Verify.
  const count = await fetch(
    `${URL_}/rest/v1/approved_operators?operation_type=eq.mehko&select=count`,
    { headers: { ...H, Prefer: "count=exact" } }
  );
  console.log(`  approved_operators now holds ${(await count.json())[0]?.count} MEHKO rows.`);
  console.log("Done.");
}

main().catch((e) => {
  console.error("Import failed:", e.message);
  process.exit(1);
});
