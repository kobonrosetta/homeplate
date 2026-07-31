import Link from "next/link";
import { getCurrentCook } from "@/lib/cook";
import { createClient } from "@/lib/supabase/server";
import { updateKitchen } from "../edit/actions";
import { toggleKitchenPause } from "./actions";
import PickupWindowsField from "@/components/pickup-windows-field";
import PickupLocationField from "@/components/pickup-location-field";
import {
  TextField,
  TextArea,
  SelectField,
  CheckboxField,
  SubmitButton,
  FormError,
} from "@/components/form";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { user, cook } = await getCurrentCook();
  const supabase = createClient();
  const { data: priv } = await supabase
    .from("cook_private")
    .select("street_address, cdtfa_permit, pickup_location")
    .eq("cook_id", cook.id)
    .maybeSingle();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null as { phone: string | null } | null };
  const tags = (cook.cuisine_tags ?? []).join(", ");

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold text-ink">Kitchen settings</h2>

      {/* Approved but payouts not finished: the kitchen is NOT visible anywhere
          yet, so don't claim "live" (or offer to hide what's already hidden). */}
      {cook.status === "active" && !cook.stripe_ready && (
        <div className="mt-4 rounded-xl bg-card p-4 shadow-soft">
          <p className="text-sm font-medium text-ink">
            Approved — goes live once payouts are set up
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Your kitchen stays hidden from buyers until Stripe payout setup is
            done.{" "}
            <Link
              href="/dashboard/payouts"
              className="font-medium text-brand underline-offset-2 hover:underline"
            >
              Set up payouts →
            </Link>
          </p>
        </div>
      )}

      {((cook.status === "active" && cook.stripe_ready) ||
        cook.status === "paused") && (
        <form
          action={toggleKitchenPause}
          className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-card p-4 shadow-soft"
        >
          <div>
            <p className="text-sm font-medium text-ink">
              {cook.status === "active"
                ? "Your kitchen is live"
                : "Your kitchen is paused"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {cook.status === "active"
                ? "Going on vacation or slammed this week? Pause to hide your kitchen — no new orders until you resume."
                : "Buyers can't see your kitchen or place orders. Resume whenever you're ready."}
            </p>
          </div>
          <button
            type="submit"
            className={
              cook.status === "active"
                ? "shrink-0 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:border-muted hover:bg-line"
                : "shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
            }
          >
            {cook.status === "active" ? "Pause kitchen" : "Resume selling"}
          </button>
        </form>
      )}

      <form action={updateKitchen} className="mt-4 space-y-8">
        <FormError message={searchParams.error} />

        {/* ── The basics ─────────────────────────────────── */}
        <section className="space-y-5">
          <SectionHeader>The basics</SectionHeader>

          <TextField
            label="Kitchen / business name"
            name="business_name"
            required
            defaultValue={cook.business_name}
          />

          <div>
            <TextField
              label="Your name"
              name="owner_name"
              defaultValue={cook.owner_name ?? ""}
              placeholder="e.g. Maria"
            />
            <p className="mt-1 text-xs text-faint">
              Shown on your storefront as the person behind the kitchen (“Meet
              the cook”). A first name is perfect — buyers trust a name and a
              face far more than a logo.
            </p>
          </div>

          <div>
            {cook.permit_verified ? (
              // Locked once verified: switching program (MEHKO<->cottage) would
              // keep a County-verified badge earned under the OTHER program. The
              // DB guard enforces this too; the hidden input keeps the form
              // submitting the current value so a normal save still passes.
              <>
                <span className="text-sm font-medium text-ink">
                  Operation type
                </span>
                <input
                  type="hidden"
                  name="operation_type"
                  value={cook.operation_type}
                />
                <p className="mt-1 rounded-lg border border-line bg-card px-4 py-2.5 text-ink">
                  {cook.operation_type === "mehko"
                    ? "MEHKO (hot home-cooked meals)"
                    : "Cottage food (baked goods, jams, shelf-stable)"}
                </p>
                <p className="mt-1 text-xs text-faint">
                  Locked to your verified permit type — contact support if your
                  permit itself changed.
                </p>
              </>
            ) : (
              <>
                <SelectField
                  label="Operation type"
                  name="operation_type"
                  defaultValue={cook.operation_type}
                  options={[
                    { value: "cottage", label: "Cottage food (baked goods, jams, shelf-stable)" },
                    { value: "mehko", label: "MEHKO (hot home-cooked meals)" },
                  ]}
                />
                <p className="mt-1 text-xs text-faint">
                  Sets how sales tax works — only MEHKO (hot food) sees the tax
                  tools. Change it only if your permit type changed.
                </p>
              </>
            )}
          </div>

          <div>
            <TextArea
              label="Your story"
              name="bio"
              rows={4}
              defaultValue={cook.bio ?? ""}
              placeholder="How you got started, what you love to make, what makes your food yours…"
            />
            <p className="mt-1 text-xs text-faint">
              This is what buyers read under “Meet the cook.” A few honest
              sentences do more to win a first order than anything else on the
              page.
            </p>
          </div>

          <div className="block">
            <span className="text-sm font-medium text-ink">Your photo</span>
            {cook.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cook.avatar_url}
                alt=""
                className="mt-1 h-16 w-16 rounded-full object-cover"
              />
            )}
            <input
              name="avatar"
              type="file"
              accept="image/*"
              className="mt-2 block w-full text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-line file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-line"
            />
            <p className="mt-1 text-xs text-faint">
              {cook.avatar_url
                ? "Upload to replace your photo."
                : "A friendly face builds trust with buyers."}
            </p>
          </div>

          <div className="block">
            <span className="text-sm font-medium text-ink">Cover photo</span>
            {cook.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cook.cover_url}
                alt=""
                className="mt-1 aspect-[16/6] w-full rounded-lg object-cover"
              />
            )}
            <input
              name="cover"
              type="file"
              accept="image/*"
              className="mt-2 block w-full text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-line file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-line"
            />
            <p className="mt-1 text-xs text-faint">
              {cook.cover_url
                ? "Upload to replace the banner across the top of your storefront."
                : "The wide banner across the top of your storefront — a bright, appetizing shot of your food or table sets the tone."}
            </p>
          </div>

          <TextField
            label="Cuisine tags (comma separated)"
            name="cuisine_tags"
            defaultValue={tags}
          />
        </section>

        {/* ── Where you are ──────────────────────────────── */}
        <section className="space-y-5">
          <SectionHeader>Where you are</SectionHeader>

          <div className="space-y-4">
            <TextField
              label="Street address"
              name="street_address"
              required
              defaultValue={priv?.street_address ?? ""}
            />
            <div className="grid grid-cols-2 gap-4">
              <TextField label="City" name="city" required defaultValue={cook.city ?? ""} />
              <TextField label="ZIP" name="zip" defaultValue={cook.zip ?? ""} />
            </div>
            <TextField
              label="Neighborhood (optional)"
              name="neighborhood"
              defaultValue={cook.neighborhood ?? ""}
              placeholder="e.g. West Sunnyvale"
            />
            <p className="text-xs text-faint">
              Shoppers only ever see your <span className="text-ink">city and neighborhood</span> —
              never your street address. If you offer home pickup, your address is
              shared with a buyer after they order; if you meet somewhere else, it&apos;s
              never shared.
            </p>
          </div>

          {cook.operation_type === "mehko" && (
            <div>
              <TextField
                label="CDTFA seller's permit number"
                name="cdtfa_permit"
                defaultValue={priv?.cdtfa_permit ?? ""}
                placeholder="e.g. 123-456789"
              />
              <p className="mt-1 text-xs text-faint">
                Private — for remitting California sales tax on hot food. Free at{" "}
                <a
                  href="https://www.cdtfa.ca.gov"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-ink"
                >
                  cdtfa.ca.gov
                </a>
                .
              </p>
            </div>
          )}
        </section>

        {/* ── How buyers get their food ──────────────────── */}
        <section className="space-y-5">
          <SectionHeader>How buyers get their food</SectionHeader>

          <div className="space-y-4 rounded-xl bg-card p-4 shadow-soft">
            <div className="space-y-3">
              <CheckboxField
                label="Pickup available"
                name="pickup_available"
                defaultChecked={cook.pickup_available}
              />
              <PickupWindowsField defaultValue={cook.pickup_windows ?? []} />
              <PickupLocationField
                defaultValue={priv?.pickup_location ?? ""}
                homeAddress={
                  [priv?.street_address, cook.city].filter(Boolean).join(", ") || ""
                }
              />
            </div>
            <div className="space-y-3 border-t border-line pt-4">
              <CheckboxField
                label="Delivery available"
                name="delivery_available"
                defaultChecked={cook.delivery_available}
              />
              <TextField
                label="Delivery notes (optional)"
                name="delivery_notes"
                defaultValue={cook.delivery_notes ?? ""}
              />
            </div>
          </div>

          <div>
            <TextField
              label="Contact phone"
              name="contact_phone"
              type="tel"
              defaultValue={profile?.phone ?? ""}
              placeholder="(408) 555-0139"
            />
            <p className="mt-1 text-xs text-faint">
              Shared with a buyer only after they order, to coordinate the
              handoff. Never shown publicly.
            </p>
          </div>
        </section>

        <SubmitButton>Save changes</SubmitButton>
      </form>

      <p className="mt-4 text-xs text-faint">
        Permit number and verification can&apos;t be changed here — contact support to
        update your permit.
      </p>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
      {children}
    </h3>
  );
}
