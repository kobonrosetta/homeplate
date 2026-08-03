import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUsd } from "@/lib/constants";
import EmptyState from "@/components/empty-state";
import { renameCook } from "./actions";
import {
  KitchenControls,
  VerifiedToggle,
  Stat,
  StatusBadge,
  MatchNote,
} from "./ui";

export const dynamic = "force-dynamic";

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  active: 1,
  paused: 2,
  suspended: 3,
};
const PAID = new Set(["confirmed", "in_progress", "ready", "completed"]);

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { archived?: string };
}) {
  // Invisible to anyone who isn't an admin.
  const admin = await getAdminUser();
  if (!admin) notFound();
  const showArchived = searchParams.archived === "1";

  const db = createAdminClient();

  const { data: cooks } = await db
    .from("cooks")
    .select(
      "id, business_name, owner_name, profile_id, permit_number, permit_verified, operation_type, city, bio, status, stripe_ready, archived_at, approved_operator_id, created_at"
    )
    .order("created_at", { ascending: false });
  const all = (cooks ?? []).sort(
    (a: any, b: any) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  );
  const active = all.filter((c: any) => !c.archived_at);
  const archived = all.filter((c: any) => c.archived_at);
  const nameById = new Map(all.map((c: any) => [c.id, c.business_name]));
  const today = new Date().toISOString().slice(0, 10);

  // County matches.
  const opIds = all.map((c: any) => c.approved_operator_id).filter(Boolean);
  const { data: ops } = opIds.length
    ? await db
        .from("approved_operators")
        .select("id, name, permit_number, city, expires_at, operation_type")
        .in("id", opIds)
    : { data: [] as any[] };
  const opById = new Map((ops ?? []).map((o: any) => [o.id, o]));

  // Orders.
  const { data: orders } = await db
    .from("orders")
    .select(
      "id, cook_id, status, subtotal_cents, service_fee_cents, total_cents, created_at"
    )
    .order("created_at", { ascending: false });
  const allOrders = orders ?? [];
  const paidOrders = allOrders.filter((o: any) => PAID.has(o.status));

  const { data: payouts } = await db
    .from("payouts")
    .select("cook_id, amount_cents");
  const { data: stripeRows } = await db
    .from("cook_stripe")
    .select("cook_id, stripe_account_id, details_submitted, disabled_reason");
  const stripeByCook = new Map(
    (stripeRows ?? []).map((r: any) => [r.cook_id, r])
  );

  const sumBy = (rows: any[], key: string, field: string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + (r[field] ?? 0));
    return m;
  };
  const countByCook = (rows: any[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.cook_id, (m.get(r.cook_id) ?? 0) + 1);
    return m;
  };

  const orderCountByCook = countByCook(allOrders); // any status (delete guard)
  const transferredByCook = sumBy(paidOrders, "cook_id", "subtotal_cents");
  const paidOutByCook = sumBy(payouts ?? [], "cook_id", "amount_cents");

  // Contact details.
  const { data: authData } = await db.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(
    (authData?.users ?? []).map((u: any) => [u.id, u.email])
  );
  const { data: profs } = await db.from("profiles").select("id, phone");
  const phoneById = new Map((profs ?? []).map((p: any) => [p.id, p.phone]));

  // Permit photos → short-lived signed URLs.
  let privRows: any[] | null = (
    await db
      .from("cook_private")
      .select("cook_id, permit_photo_path, cdtfa_permit")
      .in(
        "cook_id",
        all.map((c: any) => c.id)
      )
  ).data;
  if (!privRows) {
    privRows = (
      await db
        .from("cook_private")
        .select("cook_id, permit_photo_path")
        .in(
          "cook_id",
          all.map((c: any) => c.id)
        )
    ).data;
  }
  const cdtfaByCook = new Map(
    (privRows ?? [])
      .filter((r: any) => r.cdtfa_permit)
      .map((r: any) => [r.cook_id, r.cdtfa_permit])
  );
  const photoPathByCook = new Map(
    (privRows ?? [])
      .filter((r: any) => r.permit_photo_path)
      .map((r: any) => [r.cook_id, r.permit_photo_path])
  );
  const signedByPath = new Map<string, string>();
  const photoPaths = [...photoPathByCook.values()] as string[];
  if (photoPaths.length) {
    const { data: signed } = await db.storage
      .from("permits")
      .createSignedUrls(photoPaths, 600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) signedByPath.set(s.path, s.signedUrl);
    }
  }

  // Marketplace pulse.
  const gmv = paidOrders.reduce((n, o: any) => n + o.total_cents, 0);
  const feeRevenue = paidOrders.reduce((n, o: any) => n + o.service_fee_cents, 0);
  const cookEarnings = paidOrders.reduce((n, o: any) => n + o.subtotal_cents, 0);
  const recent = paidOrders.slice(0, 6);
  const pendingCount = active.filter((c: any) => c.status === "pending").length;

  const renderCard = (c: any) => {
    const op = c.approved_operator_id ? opById.get(c.approved_operator_id) : null;
    const orderCount = orderCountByCook.get(c.id) ?? 0;
    const transferred = transferredByCook.get(c.id) ?? 0;
    const paidOut = paidOutByCook.get(c.id) ?? 0;
    const stripe = stripeByCook.get(c.id);
    const email = emailById.get(c.profile_id);
    const phone = phoneById.get(c.profile_id);
    return (
      <div key={c.id} className="rounded-xl border border-line p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/kitchen/${c.id}`}
              className="font-medium text-ink hover:underline"
            >
              {c.business_name}
            </Link>
            <StatusBadge status={c.status} />
            {c.archived_at && (
              <span className="rounded-full bg-line px-2 py-0.5 text-xs text-muted">
                Archived
              </span>
            )}
          </div>
          <span className="text-sm text-muted">
            {new Date(c.created_at).toLocaleDateString()}
          </span>
        </div>

        <p className="mt-1 text-sm text-muted">
          {email ? (
            <a href={`mailto:${email}`} className="hover:text-ink hover:underline">
              {email}
            </a>
          ) : (
            "no email"
          )}
          {" · "}
          {phone ? (
            <a href={`tel:${phone}`} className="hover:text-ink hover:underline">
              {phone}
            </a>
          ) : (
            <span className="text-amber-700">no phone</span>
          )}
        </p>

        <div className="mt-3 grid gap-3 rounded-lg bg-card p-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">
              Entered permit
            </p>
            <p className="mt-0.5 text-ink">
              {c.permit_number || "—"} · {c.operation_type}
              {c.city ? ` · ${c.city}` : ""}
            </p>
            {c.operation_type === "mehko" &&
              (cdtfaByCook.get(c.id) ? (
                <p className="mt-0.5 text-xs text-emerald-700">
                  ✓ CDTFA seller&apos;s permit {cdtfaByCook.get(c.id)}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted">
                  – no CDTFA seller&apos;s permit yet (hot-food sales tax)
                </p>
              ))}
            {(() => {
              const p = photoPathByCook.get(c.id);
              const url = p ? signedByPath.get(p as string) : undefined;
              if (url) {
                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs font-medium text-brand underline hover:no-underline"
                  >
                    View permit photo →
                  </a>
                );
              }
              if (p) {
                return (
                  <p className="mt-1 text-xs text-faint">
                    Permit photo on file — refresh to view
                  </p>
                );
              }
              return c.status === "pending" ? (
                <p className="mt-1 text-xs font-medium text-amber-700">
                  ⚠ No permit photo — confirm this account is really the operator
                  before approving
                </p>
              ) : (
                <p className="mt-1 text-xs text-faint">No permit photo uploaded</p>
              );
            })()}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">
              County list match
            </p>
            <MatchNote cook={c} op={op} today={today} />
          </div>
        </div>

        {/* Payouts — automated via Connect. */}
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg bg-card p-3 text-sm">
          {c.stripe_ready ? (
            <span className="font-medium text-emerald-700">✓ Payouts active</span>
          ) : stripe?.details_submitted ? (
            <span className="font-medium text-amber-700">
              ⏳ Stripe reviewing
              {stripe?.disabled_reason ? ` — ${stripe.disabled_reason}` : ""}
            </span>
          ) : (
            <span className="font-medium text-amber-700">
              ⚠ Payouts not set up — kitchen hidden from buyers
              {stripe?.disabled_reason ? ` (${stripe.disabled_reason})` : ""}
            </span>
          )}
          <span className="text-muted">
            Sent via Stripe{" "}
            <span className="text-ink">{formatUsd(transferred)}</span>
          </span>
          {paidOut > 0 && (
            <span className="text-muted">
              Paid by hand (legacy){" "}
              <span className="text-ink">{formatUsd(paidOut)}</span>
            </span>
          )}
        </div>

        <form action={renameCook} className="mt-3 flex items-center gap-2">
          <input type="hidden" name="cook_id" value={c.id} />
          <input
            name="business_name"
            defaultValue={c.business_name}
            className="flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink outline-none focus:border-muted"
          />
          <button className="rounded-full border border-line px-3 py-1.5 text-sm text-ink hover:bg-card">
            Save name
          </button>
        </form>

        {c.bio && <p className="mt-3 text-sm text-muted">{c.bio}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <div className="mr-auto flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted">
              {orderCount} {orderCount === 1 ? "order" : "orders"}
            </span>
            <VerifiedToggle cookId={c.id} verified={c.permit_verified} />
            <Link
              href={`/admin/kitchen/${c.id}`}
              className="text-xs font-medium text-brand hover:underline"
            >
              Manage →
            </Link>
          </div>
          <KitchenControls cook={c} orderCount={orderCount} />
        </div>
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Admin</h1>

      {/* Marketplace pulse */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Paid orders" value={String(paidOrders.length)} />
        <Stat label="Buyer spend (GMV)" value={formatUsd(gmv)} />
        <Stat label="Your fees" value={formatUsd(feeRevenue)} />
        <Stat
          label="To chefs (auto via Stripe)"
          value={formatUsd(cookEarnings)}
          accent
        />
      </div>

      {recent.length > 0 && (
        <>
          <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-faint">
            Recent orders
          </h2>
          <div className="mt-2 divide-y divide-line rounded-lg border border-line">
            {recent.map((o: any) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
              >
                <span className="text-ink">{nameById.get(o.cook_id) ?? "—"}</span>
                <span className="text-muted">
                  {formatUsd(o.total_cents)} · {o.status} ·{" "}
                  {new Date(o.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-faint">
        Kitchens · {pendingCount} pending · {active.length} shown
      </h2>

      {active.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No kitchens yet." />
        </div>
      ) : (
        <div className="mt-3 space-y-4">{active.map(renderCard)}</div>
      )}

      {archived.length > 0 &&
        (showArchived ? (
          <>
            <div className="mt-8 flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
                Archived · {archived.length}
              </h2>
              <Link
                href="/admin"
                className="text-xs font-medium text-brand hover:underline"
              >
                Hide archived
              </Link>
            </div>
            <div className="mt-3 space-y-4 opacity-75">
              {archived.map(renderCard)}
            </div>
          </>
        ) : (
          <p className="mt-6 text-sm">
            <Link
              href="/admin?archived=1"
              className="font-medium text-brand hover:underline"
            >
              Show {archived.length} archived kitchen
              {archived.length === 1 ? "" : "s"} →
            </Link>
          </p>
        ))}
    </main>
  );
}
