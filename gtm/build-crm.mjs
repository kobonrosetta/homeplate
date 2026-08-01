// Build the chef-outreach CRM from Santa Clara County's PUBLIC permit lists
// (the same open-data feeds the app imports from). Re-runnable — run it again to
// refresh names / cities / expiry as the county updates the lists.
//
//   node gtm/build-crm.mjs
//
// Writes gtm/chef-outreach-crm.csv (open in Excel / Google Sheets). No secrets
// needed: these are public records.
import { writeFileSync } from "node:fs";

const MEHKO = "https://data.sccgov.org/resource/um9j-d9mm.json";   // hot meals
const COTTAGE = "https://data.sccgov.org/resource/fgj3-8svr.json"; // baked goods
const TODAY = new Date("2026-08-01");

// MEHKO expiry is "YYYYMMDD"; cottage is "M/D/YYYY". Normalize both to a Date.
function parseExp(s) {
  if (!s) return null;
  if (/^\d{8}$/.test(s)) return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
  return null;
}
const iso = (d) => (d ? d.toISOString().slice(0, 10) : "");
const titleCase = (s) =>
  (s ?? "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();

async function fetchAll(url) {
  const res = await fetch(`${url}?$limit=5000`);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// Tier: San Jose is where 57% of MEHKOs are, so start there. Within a geography,
// hot-meal (MEHKO) kitchens are the flagship supply, bakers next.
function tier(type, city) {
  const sj = city.toUpperCase() === "SAN JOSE";
  if (type === "MEHKO") return sj ? "A · SJ hot-meal" : "C · other-city hot-meal";
  return sj ? "B · SJ baker" : "D · other-city baker";
}

const rows = [];
for (const [type, url] of [["MEHKO", MEHKO], ["Cottage", COTTAGE]]) {
  const data = await fetchAll(url);
  for (const r of data) {
    const city = titleCase(r.city);
    const exp = parseExp(r.permit_exp__date);
    rows.push({
      tier: tier(type, city),
      type,
      facility: titleCase(r.facility),
      city,
      permit: (r.permit_ ?? "").trim(),
      expires: iso(exp),
      active: exp && exp >= TODAY ? "Y" : "N",
    });
  }
}

// Active permits first, then tier (A→D), then city, then name.
const tierRank = (t) => t.charCodeAt(0);
rows.sort(
  (a, b) =>
    (a.active === b.active ? 0 : a.active === "Y" ? -1 : 1) ||
    tierRank(a.tier) - tierRank(b.tier) ||
    a.city.localeCompare(b.city) ||
    a.facility.localeCompare(b.facility)
);

// CSV. Empty trailing columns are for you to fill during outreach.
const HEADERS = [
  "Tier", "Type", "Facility", "City", "Permit #", "Permit expires", "Active?",
  "Website / social (fill in)", "Contact — email/phone/DM (fill in)",
  "Status", "Last contacted", "Notes",
];
const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const lines = [HEADERS.join(",")];
for (const r of rows) {
  lines.push(
    [r.tier, r.type, r.facility, r.city, r.permit, r.expires, r.active,
     "", "", "Not started", "", ""].map(esc).join(",")
  );
}
writeFileSync(new URL("./chef-outreach-crm.csv", import.meta.url), lines.join("\n") + "\n");

const active = rows.filter((r) => r.active === "Y").length;
const sjMehko = rows.filter((r) => r.tier.startsWith("A") && r.active === "Y").length;
console.log(`Wrote gtm/chef-outreach-crm.csv — ${rows.length} operators (${active} active).`);
console.log(`Tier A (San Jose hot-meal, active): ${sjMehko} — start here.`);
