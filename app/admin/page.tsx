import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUsd } from "@/lib/constants";
import { nameMatchTier, isExpired } from "@/lib/match";
import StatusPill from "@/components/status-pill";
import EmptyState from "@/components/empty-state";
import {
  approveCook,
  rejectCook,
  renameCook,
  deleteCook,
  recordPayout,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  active: 1,
  paused: 2,
  suspended: 3,
};
const PAID = new Set(["confirmed", "in_progress", "ready", "completed"]);

export default async function AdminPage() {
  // Invisible to anyone who isn't an admin.
  const admin = await getAdminUser();
  if (!admin) notFound();

  const db = createAdminClient();

  const { data: cooks } = await db
    .from("cooks")
    .select(
      "id, business_name, profile_id, permit_number, permit_verified, operation_type, city, bio, status, approved_operator_id, created_at"
    )
    .order("created_at", { ascending: false });
  const list = (cooks ?? []).sort(
    (a: any, b: any) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  );
  const nameById = new Map(list.map((c: any) => [c.id, c.business_name]));
  const today = new Date().toISOString().slice(0, 10);

  // County matches.
  const opIds = list.map((c: any) => c.approved_operator_id).filter(Boolean);
  const { data: ops } = opIds.length
    ? await db
        .from("approved_operators")
        .select("id, name, permit_number, city, expires_at")
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
  const completed = allOrders.filter((o: any) => o.status === "completed");

  // Payouts already recorded.
  const { data: payouts } = await db
    .from("payouts")
    .select("cook_id, amount_cents");

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
  const earnedByCook = sumBy(completed, "cook_id", "subtotal_cents");
  const paidOutByCook = sumBy(payouts ?? [], "cook_id", "amount_cents");

  // Contact details: emails (from auth) + phones (from profiles).
  const { data: authData } = await db.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(
    (authData?.users ?? []).map((u: any) => [u.id, u.email])
  );
  const { data: profs } = await db.from("profiles").select("id, phone");
  const phoneById = new Map((profs ?? []).map((p: any) => [p.id, p.phone]));

  // Permit photos live in the private "permits" bucket — turn each stored path
  // into a short-lived signed URL (service role) so the reviewer can open it.
  // (cdtfa_permit rides along; the fallback select keeps permit-photo review
  // working if migration 23 hasn't been applied yet.)
  let privRows: any[] | null = (
    await db
      .from("cook_private")
      .select("cook_id, permit_photo_path, cdtfa_permit")
      .in("cook_id", list.map((c: any) => c.id))
  ).data;
  if (!privRows) {
    privRows = (
      await db
        .from("cook_private")
        .select("cook_id, permit_photo_path")
        .in("cook_id", list.map((c: any) => c.id))
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
  const totalEarned = completed.reduce((n, o: any) => n + o.subtotal_cents, 0);
  const totalPaidOut = (payouts ?? []).reduce(
    (n, p: any) => n + p.amount_cents,
    0
  );
  const owedTotal = totalEarned - totalPaidOut;
  const recent = paidOrders.slice(0, 6);
  const pendingCount = list.filter((c: any) => c.status === "pending").length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Admin</h1>

      {/* Marketplace pulse */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Paid orders" value={String(paidOrders.length)} />
        <Stat label="Buyer spend (GMV)" value={formatUsd(gmv)} />
        <Stat label="Your fees" value={formatUsd(feeRevenue)} />
        <Stat label="Owed to cooks" value={formatUsd(owedTotal)} accent />
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
                <span className="text-ink">
                  {nameById.get(o.cook_id) ?? "—"}
                </span>
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
        Kitchens · {pendingCount} pending · {list.length} total
      </h2>

      {list.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No kitchens yet." />
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {list.map((c: any) => {
            const op = c.approved_operator_id
              ? opById.get(c.approved_operator_id)
              : null;
            const orderCount = orderCountByCook.get(c.id) ?? 0;
            const earned = earnedByCook.get(c.id) ?? 0;
            const paidOut = paidOutByCook.get(c.id) ?? 0;
            const owed = earned - paidOut;
            const email = emailById.get(c.profile_id);
            const phone = phoneById.get(c.profile_id);
            return (
              <div key={c.id} className="rounded-xl border border-line p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">
                      {c.business_name}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                  <span className="text-sm text-muted">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>

                <p className="mt-1 text-sm text-muted">
                  {email || "no email"}
                  {phone ? ` · ${phone}` : ""}
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
                          – no CDTFA seller&apos;s permit yet (hot-food sales
                          tax)
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
                      // The county list is public, so a green match alone
                      // proves nothing about WHO is signing up — without a
                      // permit photo, identity rests entirely on this review.
                      return c.status === "pending" ? (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          ⚠ No permit photo — confirm this account is really
                          the operator before approving
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-faint">
                          No permit photo uploaded
                        </p>
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

                {/* Payouts */}
                <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg bg-card p-3 text-sm">
                  <span className="text-muted">
                    Earned <span className="text-ink">{formatUsd(earned)}</span>
                  </span>
                  <span className="text-muted">
                    Paid out <span className="text-ink">{formatUsd(paidOut)}</span>
                  </span>
                  <span className="text-muted">
                    Owed{" "}
                    <span className="font-semibold text-ink">
                      {formatUsd(owed)}
                    </span>
                  </span>
                  <form
                    action={recordPayout}
                    className="ml-auto flex items-center gap-2"
                  >
                    <input type="hidden" name="cook_id" value={c.id} />
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="w-24 rounded-lg border border-line px-2 py-1 text-sm text-ink outline-none focus:border-muted"
                    />
                    <button className="rounded-full border border-line px-3 py-1 text-sm text-ink hover:bg-line/50">
                      Record payout
                    </button>
                  </form>
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

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <span className="mr-auto text-xs text-muted">
                    {orderCount} {orderCount === 1 ? "order" : "orders"}
                  </span>
                  {c.status !== "active" && (
                    <form action={approveCook}>
                      <input type="hidden" name="cook_id" value={c.id} />
                      <button className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">
                        Approve → go live
                      </button>
                    </form>
                  )}
                  {c.status !== "paused" && (
                    <form action={rejectCook}>
                      <input type="hidden" name="cook_id" value={c.id} />
                      <button className="rounded-full border border-line px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                        {c.status === "active" ? "Pause" : "Reject"}
                      </button>
                    </form>
                  )}
                  {orderCount === 0 && (
                    <form action={deleteCook}>
                      <input type="hidden" name="cook_id" value={c.id} />
                      <button className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-line/50 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${
          accent ? "text-brand" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// Tells the reviewer how the entered permit lines up with the county list. The
// permit match (found + not expired) is what verifies a kitchen; the NAME is
// advisory only — cooks brand differently from their permit name, so a name
// gap is a "look closer," never a disqualifier. Green = permit is live; the
// name line just points the reviewer's attention.
function MatchNote({
  cook,
  op,
  today,
}: {
  cook: any;
  op: any;
  today: string;
}) {
  if (!op) {
    return (
      <p className="mt-0.5 text-red-600">
        ✗ {cook.permit_number ? "permit not on the county list" : "no permit entered"}
      </p>
    );
  }
  if (isExpired(op.expires_at, today)) {
    return (
      <p className="mt-0.5 text-red-600">
        ✗ permit {op.permit_number} expired {op.expires_at} — {op.name}
      </p>
    );
  }
  const tier = nameMatchTier(cook.business_name, op.name);
  return (
    <div className="mt-0.5">
      <p className="text-emerald-700">
        ✓ permit {op.permit_number} — {op.name}
      </p>
      {tier === "none" && (
        <p className="mt-0.5 text-amber-700">
          ⚠ brand “{cook.business_name}” doesn’t resemble the permit name —
          confirm it’s the same operator
        </p>
      )}
      {tier === "partial" && (
        <p className="mt-0.5 text-muted">
          brand “{cook.business_name}” partly matches — likely a DBA or typo
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { l: string; c: string }> = {
    pending: { l: "Pending review", c: "bg-amber-100 text-amber-900" },
    active: { l: "Live", c: "bg-emerald-100 text-emerald-800" },
    paused: { l: "Paused by cook", c: "bg-line text-muted" },
    suspended: { l: "Suspended", c: "bg-red-100 text-red-800" },
  };
  const s = m[status] ?? m.pending;
  return <StatusPill label={s.l} className={s.c} />;
}
