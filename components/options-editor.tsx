"use client";

import { useState } from "react";

type Draft = {
  name: string;
  options: { name: string; priceDelta: string }[];
};

// Cook-side editor for a listing's option dropdowns (size, character, …).
// Serializes to JSON for the saveListingOptions server action; the server
// validates caps and ownership. Buyers must pick one choice per dropdown, so
// the first choice is the default — tip: make it the base one (+$0).
export default function OptionsEditor({
  listingId,
  initial,
  action,
  maxGroups,
  maxOptions,
}: {
  listingId: string;
  initial: Draft[];
  action: (formData: FormData) => Promise<void>;
  maxGroups: number;
  maxOptions: number;
}) {
  const [groups, setGroups] = useState<Draft[]>(initial);
  const [dirty, setDirty] = useState(false);

  function update(fn: (g: Draft[]) => Draft[]) {
    setGroups(fn);
    setDirty(true);
  }

  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="groups" value={JSON.stringify(groups)} />

      {groups.map((g, gi) => (
        <div key={gi} className="rounded-lg border border-line p-4">
          <div className="flex items-center gap-2">
            <input
              value={g.name}
              onChange={(e) =>
                update((gs) =>
                  gs.map((x, i) => (i === gi ? { ...x, name: e.target.value } : x))
                )
              }
              placeholder='Dropdown name, e.g. "Size" or "Character on top"'
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => update((gs) => gs.filter((_, i) => i !== gi))}
              className="shrink-0 text-sm text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {g.options.map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  value={o.name}
                  onChange={(e) =>
                    update((gs) =>
                      gs.map((x, i) =>
                        i === gi
                          ? {
                              ...x,
                              options: x.options.map((y, j) =>
                                j === oi ? { ...y, name: e.target.value } : y
                              ),
                            }
                          : x
                      )
                    )
                  }
                  placeholder={oi === 0 ? 'Choice, e.g. 6" (default)' : "Choice"}
                  className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm"
                />
                <div className="flex shrink-0 items-center gap-1 text-sm text-muted">
                  +$
                  <input
                    value={o.priceDelta}
                    onChange={(e) =>
                      update((gs) =>
                        gs.map((x, i) =>
                          i === gi
                            ? {
                                ...x,
                                options: x.options.map((y, j) =>
                                  j === oi
                                    ? { ...y, priceDelta: e.target.value }
                                    : y
                                ),
                              }
                            : x
                        )
                      )
                    }
                    placeholder="0"
                    className="w-16 rounded-lg border border-line bg-card px-2 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    update((gs) =>
                      gs.map((x, i) =>
                        i === gi
                          ? { ...x, options: x.options.filter((_, j) => j !== oi) }
                          : x
                      )
                    )
                  }
                  className="shrink-0 text-xs text-red-600 hover:underline"
                >
                  ✕
                </button>
              </div>
            ))}
            {g.options.length < maxOptions && (
              <button
                type="button"
                onClick={() =>
                  update((gs) =>
                    gs.map((x, i) =>
                      i === gi
                        ? {
                            ...x,
                            options: [...x.options, { name: "", priceDelta: "0" }],
                          }
                        : x
                    )
                  )
                }
                className="text-sm font-medium text-brand hover:underline"
              >
                + Add a choice
              </button>
            )}
          </div>
        </div>
      ))}

      {groups.length < maxGroups && (
        <button
          type="button"
          onClick={() =>
            update((gs) => [
              ...gs,
              { name: "", options: [{ name: "", priceDelta: "0" }] },
            ])
          }
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-card"
        >
          + Add a dropdown
        </button>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand/90"
        >
          Save options
        </button>
        {dirty && (
          <span className="text-xs text-amber-700">Unsaved changes</span>
        )}
      </div>
      <p className="text-xs text-faint">
        Buyers pick one choice from each dropdown. The first choice is the
        default, so make it your base option (+$0). Prices update automatically.
      </p>
    </form>
  );
}
