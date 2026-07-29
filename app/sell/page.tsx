import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentCook } from "@/lib/cook";
import { taxRateForCity } from "@/lib/tax";
import { wizardSaveKitchen, wizardAddDish, wizardFinalize } from "./actions";
import CookPitch from "./pitch";
import NewListingForm from "@/components/new-listing-form";
import PickupWindowsField from "@/components/pickup-windows-field";
import {
  TextField,
  TextArea,
  SelectField,
  CheckboxField,
  SubmitButton,
  FormError,
} from "@/components/form";

export const dynamic = "force-dynamic";

export default async function SellPage({
  searchParams,
}: {
  searchParams: { step?: string; error?: string };
}) {
  // Not signed in (or just a guest-checkout session)? This is a prospective
  // cook clicking "Apply to sell" — show the pitch, not a login wall.
  const { user, cook } = await getCurrentCook();
  if (!user || user.is_anonymous) return <CookPitch />;

  // Wizard already finished (permit submitted) → straight to the dashboard.
  if (cook?.permit_number) redirect("/dashboard");

  // Which step to show. No kitchen yet → step 1. Kitchen started → step 2 by
  // default, but ?step lets them jump back to edit or forward to verify.
  let step = 1;
  if (cook) {
    const requested = parseInt(searchParams.step ?? "", 10);
    step = requested === 1 || requested === 3 ? requested : 2;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Tracker step={step} />

      <div className="mt-6">
        <FormError message={searchParams.error} />
      </div>

      {step === 1 && <Step1 cook={cook} />}
      {step === 2 && (
        <Step2
          mehko={cook?.operation_type === "mehko"}
          taxRate={taxRateForCity(cook?.city)}
          taxPlace={cook?.city?.trim() || "Santa Clara County"}
        />
      )}
      {step === 3 && <Step3 cottage={cook?.operation_type === "cottage"} />}

      <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-faint">
        <SaveIcon />
        Your progress saves automatically — leave and come back anytime.
      </p>
    </main>
  );
}

function Tracker({ step }: { step: number }) {
  const labels = ["Your kitchen", "First dish", "Get verified"];
  return (
    <div className="flex items-center">
      {labels.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "active" : "todo";
        return (
          <div key={n} className="flex items-center">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                state === "active"
                  ? "bg-brand text-white"
                  : state === "done"
                    ? "bg-emerald-600 text-white"
                    : "bg-line text-muted"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span
              className={`ml-2 text-sm ${
                state === "active" ? "font-medium text-ink" : "text-muted"
              }`}
            >
              {label}
            </span>
            {n < 3 && <span className="mx-3 h-px w-6 bg-line sm:w-10" />}
          </div>
        );
      })}
    </div>
  );
}

function Step1({ cook }: { cook: any }) {
  const tags = (cook?.cuisine_tags ?? []).join(", ");
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">
        Tell us about your kitchen
      </h1>
      <p className="mt-1 text-muted">The easy part first — no permit or address yet.</p>

      <form action={wizardSaveKitchen} className="mt-6 space-y-5">
        <TextField
          label="Kitchen / business name"
          name="business_name"
          required
          defaultValue={cook?.business_name ?? ""}
          placeholder="Kate's Bread"
        />
        <SelectField
          label="What you make"
          name="operation_type"
          defaultValue={cook?.operation_type ?? "cottage"}
          options={[
            { value: "cottage", label: "Cottage food (baked goods, jams, shelf-stable)" },
            { value: "mehko", label: "MEHKO (hot home-cooked meals)" },
          ]}
        />
        <TextArea
          label="Short bio"
          name="bio"
          rows={3}
          defaultValue={cook?.bio ?? ""}
          placeholder="Third-generation baker. Sourdough fermented 36 hours, baked fresh every weekend."
        />
        <label className="block">
          <span className="text-sm font-medium text-ink">
            Your photo (optional)
          </span>
          <input
            name="avatar"
            type="file"
            accept="image/*"
            className="mt-1 block w-full text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-line file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-line"
          />
          <p className="mt-1 text-xs text-faint">
            A friendly face builds trust — buyers love knowing who&apos;s cooking.
          </p>
        </label>
        <TextField
          label="Cuisine tags (comma separated)"
          name="cuisine_tags"
          defaultValue={tags}
          placeholder="sourdough, pastries, vegan"
        />
        <div className="space-y-3 rounded-lg border border-line p-4">
          <p className="text-sm font-medium text-ink">
            How do customers get their food?
          </p>
          <CheckboxField
            label="Pickup available"
            name="pickup_available"
            defaultChecked={cook?.pickup_available ?? true}
          />
          <PickupWindowsField defaultValue={cook?.pickup_windows ?? []} rows={2} />
          <CheckboxField
            label="Delivery available"
            name="delivery_available"
            defaultChecked={cook?.delivery_available ?? false}
          />
          <TextField
            label="Delivery notes (optional)"
            name="delivery_notes"
            defaultValue={cook?.delivery_notes ?? ""}
            placeholder="Within 5 miles, $5 fee"
          />
        </div>
        <SubmitButton>Continue to your first dish</SubmitButton>
      </form>
    </div>
  );
}

function Step2({
  mehko,
  taxRate,
  taxPlace,
}: {
  mehko: boolean;
  taxRate: number;
  taxPlace: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Add your first dish</h1>
      <p className="mt-1 text-muted">
        Get one item up now — you can add the rest anytime.
      </p>
      <NewListingForm
        action={wizardAddDish}
        submitLabel="Continue to verification"
        servedHotUI={mehko}
        taxRate={taxRate}
        taxPlace={taxPlace}
      />
      <div className="mt-4 text-center">
        <Link href="/sell?step=3" className="text-sm text-muted hover:text-ink">
          Skip for now — I&apos;ll add dishes later →
        </Link>
      </div>
    </div>
  );
}

function Step3({ cottage }: { cottage?: boolean }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Get verified &amp; go live</h1>
      <div className="mt-3 rounded-lg border border-line bg-card p-3 text-sm text-muted">
        {cottage
          ? "Last step. Our team reviews your Cottage Food registration with the county by hand, and your address stays private. You'll hear back by email within about a day."
          : "Last step. We match your permit to Santa Clara County's published MEHKO list, and your address stays private. You'll hear back by email within about a day."}
      </div>

      <form action={wizardFinalize} className="mt-6 space-y-5">
        <TextField
          label={cottage ? "Cottage Food registration number" : "Permit number"}
          name="permit_number"
          required
          placeholder={cottage ? "Your county registration #" : "e.g. PT0503912"}
        />
        {cottage && (
          <p className="-mt-3 text-xs text-faint">
            Don&apos;t have one yet? California requires a Cottage Food
            registration to sell baked goods.{" "}
            <a
              href="https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/apply-cottage-food-operator-cfo-permit"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-ink"
            >
              How to register with Santa Clara County →
            </a>
          </p>
        )}
        <TextField
          label="Street address"
          name="street_address"
          required
          placeholder="123 Main St"
        />
        <p className="-mt-3 text-xs text-faint">
          Kept private — buyers only see your city until they place an order.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <TextField label="City" name="city" required placeholder="Sunnyvale" />
          <TextField label="ZIP" name="zip" placeholder="94086" />
        </div>
        <div className="space-y-3 rounded-lg border border-line p-4">
          <div>
            <p className="text-sm font-medium text-ink">Sales tax, handled</p>
            <p className="mt-1 text-xs text-muted">
              {cottage
                ? "Selling only cold baked goods? You usually don't need this — cold to-go food generally isn't taxed in California. Skip it unless you'll sell anything served hot."
                : "California taxes hot food sales. Your prices will include it, and your dashboard tracks exactly what you'll owe — you just need a free seller's permit from the state."}
            </p>
          </div>
          <TextField
            label="CDTFA seller's permit number (add it later if you like)"
            name="cdtfa_permit"
            placeholder="e.g. 123-456789"
          />
          <p className="text-xs text-faint">
            Free at{" "}
            <a
              href="https://www.cdtfa.ca.gov"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-ink"
            >
              cdtfa.ca.gov
            </a>{" "}
            — about 15 minutes online.
            {cottage ? "" : " Required before your kitchen goes live; we'll remind you."}
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-ink">
            Photo of your permit (optional)
          </span>
          <input
            name="permit_photo"
            type="file"
            accept="image/*,application/pdf"
            className="mt-1 block w-full text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-line file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-line"
          />
          <p className="mt-1 text-xs text-faint">
            Speeds up your review. Kept private — only the HomePlate team sees it.
          </p>
        </label>

        <div className="text-xs text-faint">
          <p>
            By submitting, you agree to the{" "}
            <details className="inline">
              <summary className="inline cursor-pointer underline hover:text-ink">
                Cook Agreement
              </summary>
              <span className="mt-2 block space-y-2 rounded-lg border border-line bg-card p-3 text-muted">
                <span className="block">
                  <span className="font-medium text-ink">
                    Your prices include tax.
                  </span>{" "}
                  The price you set for each item includes any California sales
                  tax due on it. Reporting and paying that tax is yours to do —
                  your dashboard adds it up for you each quarter.
                </span>
                <span className="block">
                  <span className="font-medium text-ink">
                    How you get paid.
                  </span>{" "}
                  You appoint HomePlate to collect payment from buyers on your
                  behalf. A buyer&apos;s payment to HomePlate settles what they
                  owe you, and HomePlate passes your full listed price on to
                  you.
                </span>
              </span>
            </details>
            .
          </p>
        </div>

        <SubmitButton>Submit application</SubmitButton>
      </form>

      <div className="mt-4 text-center">
        <Link href="/sell?step=2" className="text-sm text-muted hover:text-ink">
          ← Back
        </Link>
      </div>
    </div>
  );
}

function SaveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}
