"use client";

import { useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";

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
  description?: string;
  leadTime?: string;
};

export default function NewListingForm({
  action,
  error,
  defaults,
  submitLabel = "Add listing",
  hiddenId,
}: {
  action: (formData: FormData) => void;
  error?: string;
  defaults?: Defaults;
  submitLabel?: string;
  hiddenId?: string;
}) {
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [generating, setGenerating] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [photoOk, setPhotoOk] = useState(true);
  const [limited, setLimited] = useState(defaults?.limited ?? false);

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
            ? "Written from your photo — edit it however you like."
            : "Tip: add a photo, then rewrite — the description will match the actual item."
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

  const blockSubmit = checking || !photoOk;

  return (
    <form action={action} className="mt-6 space-y-5">
      {hiddenId && <input type="hidden" name="id" value={hiddenId} />}
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

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

      <label className="block">
        <span className="text-sm font-medium text-ink">Category</span>
        <select
          name="category"
          defaultValue={defaults?.category ?? "bread"}
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

      <label className="block">
        <span className="text-sm font-medium text-ink">Price (USD)</span>
        <input
          name="price"
          type="number"
          step="0.01"
          required
          defaultValue={defaults?.price}
          placeholder="12.00"
          className={inputClass}
        />
      </label>

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
            No cap — buyers can always order. Use the lead-time note below to set
            expectations (e.g. “Order by Friday for Sunday pickup”).
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
            Add your photo first — then “Write with AI” below can describe it.
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
                    ✕ Rejected
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
                  This photo can’t be used — scored {score}/100
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

      <label className="block">
        <span className="text-sm font-medium text-ink">
          Allergens / contains (optional)
        </span>
        <input
          name="allergens"
          defaultValue={defaults?.allergens}
          placeholder="e.g. wheat, eggs, dairy, tree nuts"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-faint">
          List anything a buyer with allergies must know — the AI can&apos;t know
          this, only you do.
        </p>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">Lead time note (optional)</span>
        <input
          name="lead_time_note"
          defaultValue={defaults?.leadTime}
          placeholder="Order by Friday for Sunday pickup"
          className={inputClass}
        />
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
