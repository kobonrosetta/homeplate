import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUsd } from "@/lib/constants";
import ConfirmSubmit from "@/components/confirm-submit";
import {
  KitchenControls,
  VerifiedToggle,
  StatusBadge,
  MatchNote,
} from "../../ui";
import {
  updateCookFields,
  deleteReview,
  deleteListing,
  setListingAvailability,
  refundOrder,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function AdminKitchenPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string; error?: string };
}) {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const db = createAdminClient();
  const id = params.id;

  const { data: cook } = await db
    .from("cooks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!cook) notFound();

  const [
    { data: priv },
    { data: stripe },
    { data: op },
    { data: orders },
    { data: listings },
    { data: reviews },
    { count: followerCount },
    { data: requests },
    { data: profile },
    userRes,
  ] = await Promise.all([
    db.from("cook_private").select("*").eq("cook_id", id).maybeSingle(),
    db.from("cook_stripe").select("*").eq("cook_id", id).maybeSingle(),
    cook.approved_operator_id
      ? db
          .from("approved_operators")
          .select("id, name, permit_number, city, expires_at, operation_type")
          .eq("id", cook.approved_operator_id)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
    db
      .from("orders")
      .select(
        "id, status, subtotal_cents, service_fee_cents, total_cents, fulfillment, created_at, contact_name, refunded_at, stripe_payment_intent_id, order_items(title, quantity, line_total_cents)"
      )
      .eq("cook_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("listings")
      .select(
        "id, title, price_cents, category, kind, is_available, quantity_available, limited_quantity, photo_url"
      )
      .eq("cook_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("reviews")
      .select("id, rating, comment, created_at, order_id")
      .eq("cook_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("cook_id", id),
    db
      .from("custom_requests")
      .select("id, title, price_cents, status, expires_at, created_at")
      .eq("cook_id", id)
      .order("created_at", { ascending: false }),
    db.from("profiles").select("full_name, phone").eq("id", cook.profile_id).maybeSingle(),
    db.auth.admin.getUserById(cook.profile_id),
  ]);

  const email = userRes?.data?.user?.email ?? null;
  const today = new Date().toISOString().slice(0, 10);

  let permitPhotoUrl: string | null = null;
  if (priv?.permit_photo_path) {
    const { data: signed } = await db.storage
      .from("permits")
      .createSignedUrl(priv.permit_photo_path, 600);
    permitPhotoUrl = signed?.signedUrl ?? null;
  }

  const orderCount = orders?.length ?? 0;
  const inp =
    "w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink outline-none focus:border-muted";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/admin" className="text-sm text-brand hover:underline">
        ← All kitchens
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">{cook.business_name}</h1>
        <StatusBadge status={cook.status} />
        {cook.archived_at && (
          <span className="rounded-full bg-line px-2 py-0.5 text-xs text-muted">
            Archived
          </span>
        )}
        <VerifiedToggle cookId={cook.id} verified={cook.permit_verified} />
      </div>
      <p className="mt-1 text-sm text-muted">
        /kitchen/{cook.slug} · joined{" "}
        {new Date(cook.created_at).toLocaleDateString()}
      </p>

      {searchParams.saved && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {searchParams.saved === "refunded"
            ? "Refund issued — the buyer has been notified."
            : "Saved."}
        </p>
      )}
      {searchParams.error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <div className="mt-4">
        <KitchenControls cook={cook} orderCount={orderCount} />
      </div>

      {/* Owner + contact */}
      <Section title="Owner & contact">
        <Field label="Owner name" value={cook.owner_name || "—"} />
        <Field label="Account name" value={profile?.full_name || "—"} />
        <Field
          label="Email"
          value={email ? <a className="text-brand hover:underline" href={`mailto:${email}`}>{email}</a> : "—"}
        />
        <Field
          label="Phone"
          value={profile?.phone ? <a className="text-brand hover:underline" href={`tel:${profile.phone}`}>{profile.phone}</a> : "—"}
        />
      </Section>

      {/* Private / permit */}
      <Section title="Private details (admin-only)">
        <Field label="Home address" value={priv?.street_address || "—"} />
        <Field
          label="Geo"
          value={priv?.latitude != null ? `${priv.latitude}, ${priv.longitude}` : "—"}
        />
        <Field label="Pickup spot" value={priv?.pickup_location || "—"} />
        <Field label="CDTFA seller's permit" value={priv?.cdtfa_permit || "—"} />
        <Field
          label="Permit photo"
          value={
            permitPhotoUrl ? (
              <a className="text-brand underline" href={permitPhotoUrl} target="_blank" rel="noreferrer">
                View →
              </a>
            ) : priv?.permit_photo_path ? (
              "on file (refresh to view)"
            ) : (
              "none uploaded"
            )
          }
        />
        <Field
          label="County list match"
          value={<MatchNote cook={cook} op={op} today={today} />}
        />
      </Section>

      {/* Stripe payouts */}
      <Section title="Payouts (Stripe Connect)">
        <Field
          label="Status"
          value={
            cook.stripe_ready
              ? "✓ Active — receiving payouts"
              : stripe?.details_submitted
                ? "⏳ Onboarding submitted, in review"
                : stripe?.stripe_account_id
                  ? "Started, not finished"
                  : "Not started"
          }
        />
        <Field label="Account" value={stripe?.stripe_account_id || "—"} />
        <Field
          label="Transfers / Payouts / Details"
          value={`${stripe?.transfers_active ? "✓" : "✗"} · ${stripe?.payouts_enabled ? "✓" : "✗"} · ${stripe?.details_submitted ? "✓" : "✗"}`}
        />
        {stripe?.disabled_reason && (
          <Field label="Stripe needs" value={stripe.disabled_reason} />
        )}
      </Section>

      {/* Edit form */}
      <Section title="Edit kitchen">
        <form action={updateCookFields} className="space-y-3">
          <input type="hidden" name="cook_id" value={cook.id} />
          <EditText name="business_name" label="Business name" defaultValue={cook.business_name} inp={inp} />
          <EditText name="owner_name" label="Owner name" defaultValue={cook.owner_name ?? ""} inp={inp} />
          <div className="grid gap-3 sm:grid-cols-2">
            <EditText name="city" label="City" defaultValue={cook.city ?? ""} inp={inp} />
            <EditText name="zip" label="ZIP" defaultValue={cook.zip ?? ""} inp={inp} />
          </div>
          <EditText name="neighborhood" label="Neighborhood" defaultValue={cook.neighborhood ?? ""} inp={inp} />
          <label className="block">
            <span className="text-xs font-medium text-muted">Operation type</span>
            <select name="operation_type" defaultValue={cook.operation_type} className={inp}>
              <option value="mehko">MEHKO (hot food)</option>
              <option value="cottage">Cottage (shelf-stable)</option>
            </select>
          </label>
          <EditText
            name="cuisine_tags"
            label="Cuisine tags (comma-separated)"
            defaultValue={(cook.cuisine_tags ?? []).join(", ")}
            inp={inp}
          />
          <EditText name="permit_number" label="Permit number" defaultValue={cook.permit_number ?? ""} inp={inp} />
          <label className="block">
            <span className="text-xs font-medium text-muted">Bio</span>
            <textarea name="bio" defaultValue={cook.bio ?? ""} rows={3} className={inp} />
          </label>
          <input type="hidden" name="pickup_delivery_form" value="1" />
          <div className="flex flex-wrap gap-5 pt-1">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="pickup_available" defaultChecked={cook.pickup_available} />
              Pickup
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="delivery_available" defaultChecked={cook.delivery_available} />
              Delivery
            </label>
          </div>
          <EditText name="delivery_notes" label="Delivery notes" defaultValue={cook.delivery_notes ?? ""} inp={inp} />
          <button className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand/90">
            Save changes
          </button>
        </form>
      </Section>

      {/* Orders */}
      <Section title={`Orders (${orderCount})`}>
        {orderCount === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line">
            {(orders ?? []).map((o: any) => (
              <div key={o.id} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink">
                    {(o.order_items ?? [])
                      .map((i: any) => `${i.quantity}× ${i.title}`)
                      .join(", ") || "—"}
                  </span>
                  <span className="whitespace-nowrap text-muted">
                    {formatUsd(o.total_cents)} · {o.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-xs text-faint">
                    cook keeps {formatUsd(o.subtotal_cents)} ·{" "}
                    {new Date(o.created_at).toLocaleDateString()} ·{" "}
                    {o.fulfillment}
                  </p>
                  {o.refunded_at ? (
                    <span className="whitespace-nowrap text-xs font-medium text-muted">
                      ✓ Refunded
                    </span>
                  ) : o.stripe_payment_intent_id ? (
                    <form action={refundOrder}>
                      <input type="hidden" name="order_id" value={o.id} />
                      <input type="hidden" name="cook_id" value={cook.id} />
                      <ConfirmSubmit
                        className="whitespace-nowrap rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        message={`Fully refund ${formatUsd(
                          o.total_cents
                        )} to the buyer? This reverses the cook's transfer and returns your service fee. Can't be undone.`}
                      >
                        Refund
                      </ConfirmSubmit>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-faint">
          Refund reverses the cook&apos;s transfer + returns the service fee
          automatically (Stripe keeps only its processing cut). The buyer is
          emailed. Un-fulfilled orders are also cancelled and restocked.
        </p>
      </Section>

      {/* Listings moderation */}
      <Section title={`Menu (${listings?.length ?? 0})`}>
        {(listings?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No listings.</p>
        ) : (
          <div className="space-y-2">
            {(listings ?? []).map((l: any) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <span className="text-ink">{l.title}</span>
                <span className="text-muted">{formatUsd(l.price_cents)}</span>
                <span className="text-xs text-faint">
                  {l.kind ?? "dish"} · {l.category}
                  {l.is_available ? "" : " · hidden"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <form action={setListingAvailability}>
                    <input type="hidden" name="listing_id" value={l.id} />
                    <input type="hidden" name="cook_id" value={cook.id} />
                    <input
                      type="hidden"
                      name="is_available"
                      value={l.is_available ? "0" : "1"}
                    />
                    <button className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:bg-card">
                      {l.is_available ? "Hide" : "Show"}
                    </button>
                  </form>
                  <form action={deleteListing}>
                    <input type="hidden" name="listing_id" value={l.id} />
                    <input type="hidden" name="cook_id" value={cook.id} />
                    <ConfirmSubmit
                      className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                      message={`Delete listing "${l.title}"? This can't be undone.`}
                    >
                      Delete
                    </ConfirmSubmit>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Reviews moderation */}
      <Section title={`Reviews (${reviews?.length ?? 0})`}>
        {(reviews?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No reviews.</p>
        ) : (
          <div className="space-y-2">
            {(reviews ?? []).map((r: any) => (
              <div
                key={r.id}
                className="flex items-start gap-3 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <div>
                  <p className="text-amber-600">
                    {"★".repeat(r.rating)}
                    <span className="text-faint">{"★".repeat(5 - r.rating)}</span>
                  </p>
                  {r.comment && <p className="mt-0.5 text-ink">{r.comment}</p>}
                  <p className="text-xs text-faint">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <form action={deleteReview} className="ml-auto">
                  <input type="hidden" name="review_id" value={r.id} />
                  <input type="hidden" name="cook_id" value={cook.id} />
                  <ConfirmSubmit
                    className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    message="Delete this review? This can't be undone."
                  >
                    Delete
                  </ConfirmSubmit>
                </form>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Followers + payment links */}
      <Section title="Other">
        <Field label="Followers" value={String(followerCount ?? 0)} />
        <Field
          label="Payment links (custom requests)"
          value={
            (requests?.length ?? 0) === 0
              ? "none"
              : (requests ?? [])
                  .map(
                    (r: any) =>
                      `${r.title} ${formatUsd(r.price_cents)} (${r.status})`
                  )
                  .join(" · ")
          }
        />
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
        {title}
      </h2>
      <div className="mt-2 rounded-xl border border-line p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-2 py-1 text-sm">
      <span className="w-44 shrink-0 text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

function EditText({
  name,
  label,
  defaultValue,
  inp,
}: {
  name: string;
  label: string;
  defaultValue: string;
  inp: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input name={name} defaultValue={defaultValue} className={inp} />
    </label>
  );
}
