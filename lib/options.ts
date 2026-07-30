// Item-option pricing and validation. Pure functions — the checkout server
// action feeds these DB rows and cart lines; nothing here trusts the client.

export type OptionGroupRow = { id: string; listing_id: string };
export type OptionRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta_cents: number;
};

export const MAX_GROUPS_PER_LISTING = 3;
export const MAX_OPTIONS_PER_GROUP = 10;

// Validate one cart line's selections against a listing's real groups/options
// and derive its authoritative unit price. Rules: exactly ONE option chosen
// per group the listing defines (a listing with no groups takes no options).
// Returns the derived price + display names, or an error string.
export function deriveUnitPrice(
  basePriceCents: number,
  listingId: string,
  groups: OptionGroupRow[],
  options: OptionRow[],
  selectedOptionIds: string[]
): { unitPriceCents: number; optionNames: string[] } | { error: string } {
  // Ignore any option group with zero live options: a non-atomic save can
  // orphan an empty group (see saveListingOptions), and an empty group the
  // buyer can't choose from would otherwise make every checkout for this
  // listing fail "please choose every option" — bricking its sales invisibly.
  const groupHasOptions = new Set(options.map((o) => o.group_id));
  const myGroups = groups.filter(
    (g) => g.listing_id === listingId && groupHasOptions.has(g.id)
  );
  const selected = [...new Set(selectedOptionIds)];

  if (myGroups.length === 0) {
    return selected.length === 0
      ? { unitPriceCents: basePriceCents, optionNames: [] }
      : { error: "This item has no options." };
  }

  const optionById = new Map(options.map((o) => [o.id, o]));
  const myGroupIds = new Set(myGroups.map((g) => g.id));
  const chosenByGroup = new Map<string, OptionRow>();

  for (const id of selected) {
    const opt = optionById.get(id);
    if (!opt || !myGroupIds.has(opt.group_id)) {
      return { error: "An option was not recognized for this item." };
    }
    if (chosenByGroup.has(opt.group_id)) {
      return { error: "Only one choice per option is allowed." };
    }
    chosenByGroup.set(opt.group_id, opt);
  }

  if (chosenByGroup.size !== myGroups.length) {
    return { error: "Please choose every option for this item." };
  }

  const ordered = myGroups
    .map((g) => chosenByGroup.get(g.id)!)
    .filter(Boolean);
  const delta = ordered.reduce((n, o) => n + o.price_delta_cents, 0);
  return {
    unitPriceCents: basePriceCents + delta,
    optionNames: ordered.map((o) => o.name),
  };
}

// Stable identity for a cart line: same listing + same choices = same line.
export function cartLineKey(
  listingId: string,
  optionIds?: string[]
): string {
  const opts = [...(optionIds ?? [])].sort();
  return opts.length ? `${listingId}|${opts.join(",")}` : listingId;
}
