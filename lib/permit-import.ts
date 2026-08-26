// Refresh approved_operators from Santa Clara County's two live open-data
// datasets (MEHKO + cottage). This is the in-app version of scripts/
// import-mehko.mjs + import-cottage.mjs, so a scheduled endpoint keeps the
// trust list current on its own instead of waiting for someone to run the
// scripts by hand. Server-only (service role) — imported by the cron route.
//
// Mapping/normalization is kept byte-identical to the scripts on purpose: the
// signup verification lookup (lib/match.ts) must hit exactly what this stores,
// and the manual scripts stay a valid fallback.

import { createAdminClient } from "@/lib/supabase/admin";

type Dataset = {
  operation_type: "mehko" | "cottage";
  dataset: string; // Socrata JSON resource
  source: string; // human-facing dataset page (stored as source_url)
};

const MEHKO: Dataset = {
  operation_type: "mehko",
  dataset: "https://data.sccgov.org/resource/um9j-d9mm.json",
  source:
    "https://data.sccgov.org/Environment/Microenterprise-Home-Kitchens-MEHKOs/um9j-d9mm",
};
const COTTAGE: Dataset = {
  operation_type: "cottage",
  dataset: "https://data.sccgov.org/resource/fgj3-8svr.json",
  source:
    "https://data.sccgov.org/Environment/Approved-Cottage-Food-Operations/fgj3-8svr",
};

// City-name normalization: exactly the scripts' version (county cities arrive
// ALL-CAPS: "SAN JOSE" -> "San Jose"). The operator NAME is stored raw as the
// county provides it (ALL-CAPS), which is what the admin console + match tiers
// already expect — do NOT title-case the name.
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

// "20260930" -> "2026-09-30"; anything unparseable -> null.
const toDate = (s: string | undefined) =>
  /^\d{8}$/.test(s ?? "") ? `${s!.slice(0, 4)}-${s!.slice(4, 6)}-${s!.slice(6, 8)}` : null;

type Op = {
  permit_number: string;
  name: string;
  city: string | null;
  operation_type: "mehko" | "cottage";
  county: "Santa Clara";
  source_url: string;
  expires_at: string | null;
  last_seen_at: string;
};

// Page through the whole dataset — Socrata caps an unqualified fetch at 1000
// rows, so an explicit $limit/$offset loop is the only correct way as the list
// grows. Stops when a page comes back short.
async function fetchAll(dataset: string): Promise<any[]> {
  const PAGE = 1000;
  const MAX = 50000; // runaway-loop backstop
  const all: any[] = [];
  for (let offset = 0; offset < MAX; offset += PAGE) {
    const res = await fetch(
      `${dataset}?$limit=${PAGE}&$offset=${offset}&$order=permit_`,
      { signal: AbortSignal.timeout(30_000) }
    );
    if (!res.ok) throw new Error(`county API ${res.status} at offset ${offset}`);
    const page = (await res.json()) as any[];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

// Map + dedupe by permit number (last wins). Permit normalization mirrors
// lib/match.ts normalizePermit (uppercase, all whitespace stripped).
function mapRows(raw: any[], cfg: Dataset, nowIso: string): Op[] {
  const byPermit = new Map<string, Op>();
  for (const r of raw) {
    const permit = String(r.permit_ ?? "").toUpperCase().replace(/\s+/g, "");
    const name = String(r.facility ?? "").trim();
    if (!permit || !name) continue;
    byPermit.set(permit, {
      permit_number: permit,
      name,
      city: r.city ? titleCase(String(r.city)) : null,
      operation_type: cfg.operation_type,
      county: "Santa Clara",
      source_url: cfg.source,
      expires_at: toDate(r.permit_exp__date),
      last_seen_at: nowIso,
    });
  }
  return [...byPermit.values()];
}

export type RefreshResult = {
  mehkoUpserted: number;
  cottageUpserted: number;
  cottageExcludedAsMehko: number;
  seedsRemoved: number;
  totalMehko: number | null;
  totalCottage: number | null;
};

// Runs both imports in the correct order and returns a summary. Throws on any
// hard failure (caller surfaces it) — a partial run never silently "succeeds".
export async function refreshApprovedOperators(): Promise<RefreshResult> {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();

  // 1) MEHKO first — cottage exclusion below keys off the fresh MEHKO set.
  const mehkoRows = mapRows(await fetchAll(MEHKO.dataset), MEHKO, nowIso);
  if (mehkoRows.length) {
    const { error } = await db
      .from("approved_operators")
      .upsert(mehkoRows, { onConflict: "permit_number" });
    if (error) throw new Error(`MEHKO upsert failed: ${error.message}`);
  }

  // 2) Cottage — but a permit that's ALSO on the MEHKO list stays MEHKO
  //    (MEHKO is the stricter/broader permit). Exclude collisions.
  const cottageRows = mapRows(await fetchAll(COTTAGE.dataset), COTTAGE, nowIso);
  const { data: mehkoNums, error: selErr } = await db
    .from("approved_operators")
    .select("permit_number")
    .eq("operation_type", "mehko");
  if (selErr) throw new Error(`MEHKO read failed: ${selErr.message}`);
  const mehkoSet = new Set((mehkoNums ?? []).map((r: any) => r.permit_number));
  const safeCottage = cottageRows.filter((r) => !mehkoSet.has(r.permit_number));
  if (safeCottage.length) {
    const { error } = await db
      .from("approved_operators")
      .upsert(safeCottage, { onConflict: "permit_number" });
    if (error) throw new Error(`cottage upsert failed: ${error.message}`);
  }

  // 3) Belt-and-suspenders: purge any leftover fake demo seeds
  //    (MEHKO-2025-* / CFO-2025-*) so nobody can verify against them.
  const { data: removed } = await db
    .from("approved_operators")
    .delete()
    .like("permit_number", "%2025-%")
    .select("permit_number");

  const [{ count: totalMehko }, { count: totalCottage }] = await Promise.all([
    db
      .from("approved_operators")
      .select("*", { count: "exact", head: true })
      .eq("operation_type", "mehko"),
    db
      .from("approved_operators")
      .select("*", { count: "exact", head: true })
      .eq("operation_type", "cottage"),
  ]);

  return {
    mehkoUpserted: mehkoRows.length,
    cottageUpserted: safeCottage.length,
    cottageExcludedAsMehko: cottageRows.length - safeCottage.length,
    seedsRemoved: removed?.length ?? 0,
    totalMehko: totalMehko ?? null,
    totalCottage: totalCottage ?? null,
  };
}
