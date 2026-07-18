import { getCurrentCook } from "@/lib/cook";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUsd } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const { cook } = await getCurrentCook();

  // The cook can read their own orders via RLS; earnings = completed subtotals.
  const supabase = createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("status, subtotal_cents")
    .eq("cook_id", cook.id);
  const earned = (orders ?? [])
    .filter((o: any) => o.status === "completed")
    .reduce((n: number, o: any) => n + (o.subtotal_cents ?? 0), 0);

  // Payouts ledger is admin-only; read this cook's rows server-side.
  const admin = createAdminClient();
  const { data: payouts } = await admin
    .from("payouts")
    .select("amount_cents, note, created_at")
    .eq("cook_id", cook.id)
    .order("created_at", { ascending: false });
  const paidOut = (payouts ?? []).reduce(
    (n: number, p: any) => n + p.amount_cents,
    0
  );
  const owed = earned - paidOut;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Earned (completed orders)" value={formatUsd(earned)} />
        <Stat label="Paid to you" value={formatUsd(paidOut)} />
        <Stat label="Owed to you" value={formatUsd(owed)} accent />
      </div>

      <p className="rounded-lg bg-brand/10 px-4 py-3 text-sm text-brand">
        During our pilot, payouts are sent by hand — you keep 100% of your price,
        and we send your earnings after each completed order. Automatic bank
        payouts are coming soon.
      </p>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
          Payment history
        </h3>
        {!payouts || payouts.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            No payouts yet — they&apos;ll show here once we&apos;ve sent your first
            one.
          </p>
        ) : (
          <div className="mt-2 divide-y divide-line rounded-xl border border-line">
            {payouts.map((p: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <span className="text-ink">
                  {new Date(p.created_at).toLocaleDateString()}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <span className="font-medium text-ink">
                  {formatUsd(p.amount_cents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
        className={`mt-1 text-2xl font-semibold ${
          accent ? "text-brand" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
