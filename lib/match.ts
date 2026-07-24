// Matching a cook's onboarding details against the county approved-operator
// list. Shared by the sell wizard (sets the auto-verify signal) and the admin
// console (shows the reviewer why something did or didn't match) so both judge
// identically.

// Permit numbers are stored as the county publishes them (e.g. "PT0503912").
// Normalize typed input to the same shape for an exact, index-friendly lookup.
export function normalizePermit(s: string): string {
  return s.toUpperCase().replace(/\s+/g, "");
}

// Fold a business name to a comparable core: lowercase, accents stripped,
// punctuation/spacing flattened. "Raffin's Bakery" and "RAFFIN BAKERY" collapse
// to the same thing; genuinely different names stay different.
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/['\u2019]/g, "") // drop apostrophes so "raffin's" -> "raffins"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  return na.length > 0 && na === normalizeName(b);
}

// A permit with no expiry recorded is treated as current (some county rows omit
// it); an expiry strictly before today is expired. `today` is YYYY-MM-DD.
export function isExpired(
  expiresAt: string | null | undefined,
  today: string
): boolean {
  return !!expiresAt && expiresAt < today;
}
