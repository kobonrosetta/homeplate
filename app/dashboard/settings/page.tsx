import { getCurrentCook } from "@/lib/cook";
import { createClient } from "@/lib/supabase/server";
import { updateKitchen } from "../edit/actions";
import { toggleKitchenPause } from "./actions";
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
  const { cook } = await getCurrentCook();
  const supabase = createClient();
  const { data: priv } = await supabase
    .from("cook_private")
    .select("street_address")
    .eq("cook_id", cook.id)
    .maybeSingle();
  const tags = (cook.cuisine_tags ?? []).join(", ");

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold text-ink">Kitchen settings</h2>

      {(cook.status === "active" || cook.status === "paused") && (
        <form
          action={toggleKitchenPause}
          className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-line bg-card p-4"
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

      <form action={updateKitchen} className="mt-4 space-y-5">
        <FormError message={searchParams.error} />

        <TextField
          label="Kitchen / business name"
          name="business_name"
          required
          defaultValue={cook.business_name}
        />

        <SelectField
          label="Operation type"
          name="operation_type"
          defaultValue={cook.operation_type}
          options={[
            { value: "cottage", label: "Cottage food (baked goods, jams, shelf-stable)" },
            { value: "mehko", label: "MEHKO (hot home-cooked meals)" },
          ]}
        />

        <TextArea label="Short bio" name="bio" rows={3} defaultValue={cook.bio ?? ""} />

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

        <TextField
          label="Street address"
          name="street_address"
          required
          defaultValue={priv?.street_address ?? ""}
        />
        <p className="-mt-3 text-xs text-faint">
          Kept private — buyers only see your city until they place an order.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <TextField label="City" name="city" required defaultValue={cook.city ?? ""} />
          <TextField label="ZIP" name="zip" defaultValue={cook.zip ?? ""} />
        </div>

        <TextField
          label="Cuisine tags (comma separated)"
          name="cuisine_tags"
          defaultValue={tags}
        />

        <div className="space-y-3 rounded-lg border border-line p-4">
          <p className="text-sm font-medium text-ink">How do customers get their food?</p>
          <CheckboxField
            label="Pickup available"
            name="pickup_available"
            defaultChecked={cook.pickup_available}
          />
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

        <SubmitButton>Save changes</SubmitButton>
      </form>

      <p className="mt-4 text-xs text-faint">
        Permit number and verification can&apos;t be changed here — contact support to
        update your permit.
      </p>
    </div>
  );
}
