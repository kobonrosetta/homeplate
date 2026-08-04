"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import { formatUsd, MAX_PREORDER_HORIZON_DAYS } from "@/lib/constants";
import { type FulfillmentMode } from "@/lib/availability";
import { formatRate, netOfTaxCents } from "@/lib/tax";
import { ALLERGENS } from "@/lib/allergens";
import { FormError } from "@/components/form";

const inputClass =
  "mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line";

// Shrink an image to a small JPEG data URL — just for the AI quality check,
// so the request stays small and fast. The full-size file still uploads.
function resizeToDataUrl(file: File, max = 768): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) return reject(new Error("no canvas"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

type Defaults = {
  title?: string;
  category?: string;
  price?: string;
  quantity?: string;
  limited?: boolean;
  allergens?: string;
  contains?: string[];
  declared?: boolean;
  ingredients?: string;
  description?: string;
  servedHot?: boolean;
  isExtra?: boolean;
  fulfillmentMode?: FulfillmentMode;
  leadDays?: number | null;
  readyDate?: string | null;
  orderBy?: string | null;
};

export default function NewListingForm({
  action,
  error,
  defaults,
  submitLabel = "Add listing",
  hiddenId,
  servedHotUI = false,
  taxRate,
  taxPlace,
}: {
  action: (formData: FormData) => void;
  error?: string;
  defaults?: Defaults;
  submitLabel?: string;
  hiddenId?: string;
  /** MEHKO kitchens only — cottage bakers never see any tax UI. */
  servedHotUI?: boolean;
  taxRate?: number;
  taxPlace?: string;
}) {
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [generating, setGenerating] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [photoOk, setPhotoOk] = useState(true);
  const [isExtra, setIsExtra] = useState(defaults?.isExtra ?? false);
  const [limited, setLimited] = useState(defaults?.limited ?? false);
  const [servedHot, setServedHot] = useState(defaults?.servedHot ?? true);
  const [priceStr, setPriceStr] = useState(defaults?.price ?? "");
  // Availability mode — new dishes inherit the kitchen default (passed in
  // defaults); each dish can override. Extras aren't food (see below).
  const [mode, setMode] = useState<FulfillmentMode>(
    defaults?.fulfillmentMode ?? "ready_now"
  );
  // Controlled (not defaultValue) so a value survives a mode toggle: the mode
  // buttons unmount/remount these inputs, and an uncontrolled input would revert
  // to its default, silently discarding the cook's edit.
  const [leadDays, setLeadDays] = useState(
    defaults?.leadDays != null ? String(defaults.leadDays) : "2"
  );
  const [readyDate, setReadyDate] = useState(defaults?.readyDate ?? "");
  const [orderBy, setOrderBy] = useState(defaults?.orderBy ?? "");

  // The CA taxability flag, phrased as menu info. Extras aren't food, so the
  // control disappears (and the flag goes false) when "extra" is checked.
  const showServedHot = servedHotUI && !isExtra;
  // Allergens apply to ALL food (cottage bakes have wheat/eggs/nuts too), so
  // unlike served_hot this shows for every dish regardless of program — just
  // not for extras, which aren't food.
  const showAllergens = !isExtra;
  // Availability shows for food only (extras aren't food — they store ready_now).
  const showAvailability = !isExtra;
  // Date-input bounds, set AFTER mount (empty on the server + first client
  // render) so SSR and hydration agree — `new Date()` in render would differ
  // between the UTC server and the browser. Picker hints only; the server
  // re-validates authoritatively in Pacific (lib/availability.ts).
  const [today, setToday] = useState("");
  const [maxPreorderIso, setMaxPreorderIso] = useState("");
  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-CA"));
    const d = new Date();
    d.setDate(d.getDate() + MAX_PREORDER_HORIZON_DAYS);
    setMaxPreorderIso(d.toLocaleDateString("en-CA"));
  }, []);

  async function runDescribe(image: string | null) {
    const title =
      (document.querySelector('input[name="title"]') as HTMLInputElement | null)
        ?.value?.trim() ?? "";
    const category =
      (document.querySelector('select[name="category"]') as HTMLSelectElement | null)
        ?.value ?? "other";

    // Need at least a name or a photo to describe.
    if (!title && !image) {
      setAiNote("Add an item name or a photo first.");
      return;
    }

    setGenerating(true);
    setAiNote(null);
    try {
      const res = await fetch("/api/ai/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, image }),
      });
      const data = await res.json();
      if (res.ok && data.description) {
        setDescription(data.description);
        setAiNote(
          image
            ? "Written from your photo. Edit it however you like."
            : "Tip: add a photo, then rewrite, and the description will match the actual item."
        );
      } else {
        setAiNote(data.error || "AI is unavailable right now.");
      }
    } catch {
      setAiNote("Couldn't reach the AI service.");
    } finally {
      setGenerating(false);
    }
  }

  function writeWithAI() {
    runDescribe(preview);
  }

  async function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setScore(null);
    setFeedback(null);
    if (!file) {
      setPreview(null);
      setPhotoOk(true);
      return;
    }
    // Extras aren't food — show the preview, skip the food-quality check.
    if (isExtra) {
      setPhotoOk(true);
      try {
        setPreview(await resizeToDataUrl(file));
      } catch {
        /* preview is best-effort */
      }
      return;
    }
    setChecking(true);
    setPhotoOk(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      setPreview(dataUrl);
      const res = await fetch("/api/ai/photo-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const d = await res.json();
      if (typeof d.score === "number") {
        setScore(d.score);
        setFeedback(d.feedback ?? null);
        setPhotoOk(Boolean(d.ok));
        // Photo passed and there's no description yet -> auto-write it from the photo.
        if (d.ok && !description.trim()) {
          runDescribe(dataUrl);
        }
      } else {
        setPhotoOk(true);
      }
    } catch {
      setPhotoOk(true);
    } finally {
      setChecking(false);
    }
  }

  const blockSubmit = checking || (!photoOk && !isExtra);

  return (
    <form action={action} className="mt-6 space-y-5">
      {hiddenId && <input type="hidden" name="id" value={hiddenId} />}
      {error && <FormError message={error} />}

      <label className="block">
        <span className="text-sm font-medium text-ink">Item name</span>
        <input
          name="title"
          required
          defaultValue={defaults?.title}
          placeholder="Sourdough loaf"
          className={inputClass}
        />
      </label>

      <label className="flex items-start gap-2 rounded-lg border border-line p-3">
        <input
          type="checkbox"
          name="kind"
          value="extra"
          checked={isExtra}
          onChange={(e) => setIsExtra(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm text-ink">
          This is an <strong>extra</strong>, not a dish
          <span className="mt-0.5 block text-xs text-muted">
            Packaging, cake lettering, gift wrap, upgrades: shown in its own
            &ldquo;Extras&rdquo; section, and the photo doesn&rsquo;t need to be
            food.
          </span>
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">Category</span>
        <select
          name="category"
          defaultValue={defaults?.category ?? (servedHotUI ? "meal" : "bread")}
          className={inputClass}
        >
          <option value="bread">Bread</option>
          <option value="pastry">Pastry</option>
          <option value="dessert">Dessert</option>
          <option value="meal">Meal</option>
          <option value="preserves">Preserves / jams</option>
          <option value="beverage">Beverage</option>
          <option value="other">Other</option>
        </select>
      </label>

      {showServedHot && (
        <div>
          <span className="text-sm font-medium text-ink">How is it served?</span>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setServedHot(true)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                servedHot
                  ? "border-brand bg-brand text-white"
                  : "border-line text-ink hover:border-muted"
              }`}
            >
              Served hot
            </button>
            <button
              type="button"
              onClick={() => setServedHot(false)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                !servedHot
                  ? "border-brand bg-brand text-white"
                  : "border-line text-ink hover:border-muted"
              }`}
            >
              Cold or room-temp
            </button>
          </div>
          <p className="mt-1 text-xs text-faint">
            {servedHot
              ? "Buyers see this on your menu."
              : "Buyers see this on your menu. Cold to-go food generally isn't taxed in California."}
          </p>
        </div>
      )}
      <input
        type="hidden"
        name="served_hot"
        value={String(showServedHot && servedHot)}
      />

      <label className="block">
        <span className="text-sm font-medium text-ink">Price (USD)</span>
        <input
          name="price"
          type="number"
          step="0.01"
          required
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          placeholder="12.00"
          className={inputClass}
        />
        <TaxHint
          show={showServedHot && servedHot}
          priceStr={priceStr}
          taxRate={taxRate}
          taxPlace={taxPlace}
        />
      </label>

      {showAvailability && (
        <div>
          <span className="text-sm font-medium text-ink">
            When can people get this?
          </span>
          <p className="mt-1 text-xs text-faint">
            Buyers see exactly when they&apos;ll get it — and can&apos;t order
            for a time you can&apos;t make.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["ready_now", "Ready now"],
                ["lead_time", "A few days' notice"],
                ["preorder", "Specific date"],
              ] as [FulfillmentMode, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setMode(val)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  mode === val
                    ? "border-brand bg-brand text-white"
                    : "border-line text-ink hover:border-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input type="hidden" name="fulfillment_mode" value={mode} />

          {mode === "ready_now" && (
            <p className="mt-2 text-xs text-faint">
              Shows a green “Ready today” — for food you have on hand or can make
              same-day.
            </p>
          )}

          {mode === "lead_time" && (
            <div className="mt-3">
              <div className="flex items-center gap-2 text-sm text-ink">
                Ready in
                <input
                  name="lead_days"
                  type="number"
                  min={0}
                  max={14}
                  value={leadDays}
                  onChange={(e) => setLeadDays(e.target.value)}
                  className="w-20 rounded-lg border border-line px-3 py-2 text-ink outline-none focus:border-muted focus:ring-2 focus:ring-line"
                />
                days
              </div>
              <p className="mt-1 text-xs text-faint">
                Buyers see “Ready by [date]”, counted from the day they order.
              </p>
            </div>
          )}

          {mode === "preorder" && (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-sm text-ink">Ready on</span>
                <input
                  name="ready_date"
                  type="date"
                  min={today || undefined}
                  max={maxPreorderIso || undefined}
                  value={readyDate}
                  onChange={(e) => setReadyDate(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-sm text-ink">Stop taking orders on</span>
                <input
                  name="order_by"
                  type="date"
                  min={today || undefined}
                  max={maxPreorderIso || undefined}
                  value={orderBy}
                  onChange={(e) => setOrderBy(e.target.value)}
                  className={inputClass}
                />
                <span className="mt-1 block text-xs text-faint">
                  Optional — defaults to the ready date. After this, the dish
                  closes itself.
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      <div>
        <span className="text-sm font-medium text-ink">
          How many can you make?
        </span>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setLimited(false)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              !limited
                ? "border-brand bg-brand text-white"
                : "border-line text-ink hover:border-muted"
            }`}
          >
            Made to order
          </button>
          <button
            type="button"
            onClick={() => setLimited(true)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              limited
                ? "border-brand bg-brand text-white"
                : "border-line text-ink hover:border-muted"
            }`}
          >
            Set a number
          </button>
        </div>
        <input type="hidden" name="limited_quantity" value={String(limited)} />
        {limited ? (
          <div className="mt-3">
            <input
              name="quantity_available"
              type="number"
              min={0}
              defaultValue={defaults?.quantity}
              placeholder="e.g. 8"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-faint">
              Counts down on its own as orders come in, and shows “Sold out” at
              zero. Bump it back up whenever you make more.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-faint">
            No cap on quantity — the “When can people get this?” choice above still
            sets when buyers can order it.
          </p>
        )}
      </div>

      <div className="block">
        <span className="text-sm font-medium text-ink">
          Photo{hiddenId ? " (upload to replace)" : ""}
        </span>
        <input
          name="photo"
          type="file"
          accept="image/*"
          onChange={onPhotoChange}
          className="mt-1 block w-full text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-line file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-line"
        />
        {!preview && (
          <p className="mt-1 text-xs text-faint">
            Your photo is what sells the dish on your storefront and browse, so add
            a clear, well-lit shot. Then “Write with AI” below can describe it.
          </p>
        )}

        {preview && (
          <div className="mt-3">
            <div className="flex items-start gap-3">
              <div className="relative h-24 w-24 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="preview"
                  className={`h-24 w-24 rounded-lg object-cover ${
                    score !== null && !photoOk ? "opacity-40" : ""
                  }`}
                />
                {score !== null && !photoOk && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-red-600/25 text-xs font-semibold text-red-700">
                    Needs a retake
                  </span>
                )}
              </div>

              <div className="flex-1 text-sm">
                {checking && <span className="text-muted">Analyzing photo…</span>}
                {!checking && score !== null && photoOk && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
                    ✓ Looks great · {score}/100
                  </span>
                )}
              </div>
            </div>

            {!checking && score !== null && !photoOk && (
              <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3">
                <p className="font-medium text-red-800">
                  This photo won’t do your food justice (scored {score}/100)
                </p>
                <p className="mt-1 text-sm text-red-700">
                  {feedback ? `${feedback} ` : ""}Upload a clear, well-lit photo of
                  the actual food you’re selling.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <label className="block">
        <span className="text-sm font-medium text-ink">
          More photos (optional)
        </span>
        <input
          name="photos"
          type="file"
          accept="image/*"
          multiple
          className="mt-1 block w-full text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-line file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-line"
        />
        <p className="mt-1 text-xs text-faint">
          Extra angles or the finished dish. Up to 4.
        </p>
      </label>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Description</span>
          <button
            type="button"
            onClick={writeWithAI}
            disabled={generating}
            className="rounded-full border border-brand/40 px-3 py-1 text-xs font-medium text-brand hover:bg-brand/10 disabled:opacity-50"
          >
            {generating ? "Writing…" : "✨ Write with AI"}
          </button>
        </div>
        <textarea
          name="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="36-hour fermented sourdough with a crackly crust and open crumb."
          className={inputClass}
        />
        {aiNote && <p className="mt-1 text-xs text-muted">{aiNote}</p>}
      </div>

      {showAllergens && (
        <div className="space-y-4 rounded-lg border border-line p-4">
          <div>
            <span className="text-sm font-medium text-ink">Allergens</span>
            <p className="mt-1 text-xs text-faint">
              Check every major allergen this dish contains. Buyers with
              allergies rely on this — the AI can&apos;t know it, only you can.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALLERGENS.map((a) => (
              <label
                key={a.key}
                className="flex items-center gap-2 text-sm text-ink"
              >
                <input
                  type="checkbox"
                  name="contains"
                  value={a.key}
                  defaultChecked={defaults?.contains?.includes(a.key)}
                />
                <span>
                  {a.label}
                  {a.example && (
                    <span className="text-xs text-faint"> — e.g. {a.example}</span>
                  )}
                </span>
              </label>
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-ink">
              Other allergen notes (optional)
            </span>
            <input
              name="allergens"
              defaultValue={defaults?.allergens}
              placeholder="e.g. contains coconut, made with pork gelatin"
              className={inputClass}
            />
          </label>

          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="allergens_declared"
              value="true"
              required
              defaultChecked={defaults?.declared}
              className="mt-1"
            />
            <span>
              I&apos;ve listed every major allergen in this dish, or confirmed it
              contains none of the above. I understand cross-contact is possible
              in a home kitchen.
            </span>
          </label>
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-ink">
          Ingredients (optional)
        </span>
        <textarea
          name="ingredients"
          rows={2}
          defaultValue={defaults?.ingredients}
          placeholder="e.g. flour, butter, sugar, eggs, vanilla"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-faint">
          Shown on the item page when filled in. Baked goods: this is what your
          cottage label lists anyway, and buyers trust seeing it.
        </p>
      </label>

      <ListingSubmit
        disabledExtra={blockSubmit}
        label={
          checking
            ? "Checking photo…"
            : !photoOk
            ? "Replace the photo to continue"
            : submitLabel
        }
      />
    </form>
  );
}

// One calm sentence of price honesty for hot items: the cook sees their real
// take BEFORE publishing, and hears the dashboard does the tracking. (Prices
// are tax-included for the pilot — see lib/tax.ts.)
function TaxHint({
  show,
  priceStr,
  taxRate,
  taxPlace,
}: {
  show: boolean;
  priceStr: string;
  taxRate?: number;
  taxPlace?: string;
}) {
  if (!show || !taxRate) return null;
  const cents = Math.round(parseFloat(priceStr) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return (
    <p className="mt-1 text-xs text-faint">
      Includes {taxPlace ?? "your area"}&rsquo;s {formatRate(taxRate)} sales tax,
      so you keep about {formatUsd(netOfTaxCents(cents, taxRate))}. Your Taxes
      card tracks what you&rsquo;ll owe; nothing to do now.
    </p>
  );
}

function ListingSubmit({
  disabledExtra,
  label,
}: {
  disabledExtra: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabledExtra}
      className="w-full rounded-full bg-brand px-6 py-3 font-medium text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
