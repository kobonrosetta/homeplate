// California sales-tax helpers for the pilot's tax-INCLUDED pricing model:
// a cook's listed price contains any tax owed (CDTFA Reg. 1603 — hot prepared
// food is taxable, cold/room-temp food sold to-go generally isn't), the cook
// remits it on their own seller's permit, and HomePlate derives the numbers
// for them. Nothing here changes what a buyer pays.

/** Santa Clara County rate (unincorporated + most cities), effective 2026-07-01. */
export const SANTA_CLARA_COUNTY_RATE = 0.0975;

// Cities whose district taxes push them above the county rate. Verified
// against the CDTFA city/county rate table
// (cdtfa.ca.gov/taxes-and-fees/rates.aspx) on 2026-07-28. Hand-maintained —
// re-check when CDTFA reposts (rate changes land Jan/Apr/Jul/Oct).
const CITY_RATES: Record<string, number> = {
  "san jose": 0.1,
  milpitas: 0.1,
  campbell: 0.105,
  "los gatos": 0.09875,
};

/** Rate for a cook's city; unknown or missing cities fall back to the county rate. */
export function taxRateForCity(city?: string | null): number {
  const key = (city ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents: "San José" -> "San Jose"
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return CITY_RATES[key] ?? SANTA_CLARA_COUNTY_RATE;
}

/** 0.0975 -> "9.75%" (up to 3 decimals, trailing zeros trimmed). */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(3).replace(/\.?0+$/, "")}%`;
}

/**
 * The tax inside a tax-included price: gross × r ÷ (1 + r).
 * A $20.00 hot dish at 9.75% contains $1.78 of tax, not $1.95 —
 * the base the state taxes is the pre-tax $18.22.
 */
export function taxPortionCents(grossCents: number, rate: number): number {
  if (grossCents <= 0) return 0;
  return Math.round((grossCents * rate) / (1 + rate));
}

/** What the cook keeps of a tax-included price after remitting. */
export function netOfTaxCents(grossCents: number, rate: number): number {
  return grossCents - taxPortionCents(grossCents, rate);
}

// ---- CDTFA quarters (returns are due the last day of the following month) ----

export type TaxQuarter = {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  label: string; // "Q3 2026"
  start: Date; // first instant of the quarter
  end: Date; // first instant of the NEXT quarter (exclusive)
  dueDate: Date; // CDTFA filing deadline for this quarter's return
};

export function quarterOf(d: Date): TaxQuarter {
  const quarter = (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  const year = d.getFullYear();
  return {
    year,
    quarter,
    label: `Q${quarter} ${year}`,
    start: new Date(year, (quarter - 1) * 3, 1),
    end: new Date(year, quarter * 3, 1),
    // Day 0 of the month after the quarter's last month = that month's final
    // day (Q3 -> Oct 31; Q4 -> Jan 31 of the next year).
    dueDate: new Date(year, quarter * 3 + 1, 0),
  };
}

/** The quarter before the one containing `d` (what's actually filable). */
export function previousQuarter(d: Date): TaxQuarter {
  const { start } = quarterOf(d);
  return quarterOf(new Date(start.getTime() - 24 * 60 * 60 * 1000));
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Oct 31, 2026" — locale-stable (server and client render identically). */
export function formatDueDate(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}
