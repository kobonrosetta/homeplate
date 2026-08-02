// Shared admin UI — used by the /admin list and the /admin/kitchen/[id] detail
// page. Server components that render service-role action forms + status/match
// display. The only client piece is ConfirmSubmit (destructive confirms).
import StatusPill from "@/components/status-pill";
import ConfirmSubmit from "@/components/confirm-submit";
import { nameMatchTier, isExpired } from "@/lib/match";
import {
  setCookStatus,
  setVerified,
  archiveCook,
  unarchiveCook,
  deleteCook,
} from "./actions";

const BTN = {
  primary:
    "rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90",
  line: "rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-card",
  danger:
    "rounded-full border border-line px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50",
  dangerOutline:
    "rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50",
} as const;

function StatusBtn({
  cookId,
  status,
  label,
  variant = "line",
}: {
  cookId: string;
  status: string;
  label: string;
  variant?: keyof typeof BTN;
}) {
  return (
    <form action={setCookStatus}>
      <input type="hidden" name="cook_id" value={cookId} />
      <input type="hidden" name="status" value={status} />
      <button className={BTN[variant]}>{label}</button>
    </form>
  );
}

// The full status/lifecycle control cluster for one kitchen, sized to its
// current state. Same set on the list card and the detail page.
export function KitchenControls({
  cook,
  orderCount,
}: {
  cook: any;
  orderCount: number;
}) {
  const id = cook.id;
  const s = cook.status;
  const archived = !!cook.archived_at;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {archived ? (
        <form action={unarchiveCook}>
          <input type="hidden" name="cook_id" value={id} />
          <button className={BTN.primary}>Unarchive</button>
        </form>
      ) : (
        <>
          {s !== "active" && (
            <StatusBtn
              cookId={id}
              status="active"
              label={s === "pending" ? "Approve → go live" : "Reactivate"}
              variant="primary"
            />
          )}
          {s === "active" && (
            <StatusBtn cookId={id} status="paused" label="Pause" variant="line" />
          )}
          {s !== "suspended" && (
            <StatusBtn
              cookId={id}
              status="suspended"
              label="Suspend"
              variant="danger"
            />
          )}
          {s === "suspended" && (
            <StatusBtn
              cookId={id}
              status="pending"
              label="Send to review"
              variant="line"
            />
          )}
          <form action={archiveCook}>
            <input type="hidden" name="cook_id" value={id} />
            <ConfirmSubmit
              className={BTN.line}
              message={`Archive "${cook.business_name}"? It's hidden from buyers and your default admin list, but every record is kept — you can unarchive it anytime.`}
            >
              Archive
            </ConfirmSubmit>
          </form>
        </>
      )}
      {orderCount === 0 && (
        <form action={deleteCook}>
          <input type="hidden" name="cook_id" value={id} />
          <ConfirmSubmit
            className={BTN.dangerOutline}
            message={`Permanently delete "${cook.business_name}"? It has no orders, so nothing is lost — but this can't be undone.`}
          >
            Delete
          </ConfirmSubmit>
        </form>
      )}
    </div>
  );
}

export function VerifiedToggle({
  cookId,
  verified,
}: {
  cookId: string;
  verified: boolean;
}) {
  return (
    <form action={setVerified}>
      <input type="hidden" name="cook_id" value={cookId} />
      <input type="hidden" name="verified" value={verified ? "0" : "1"} />
      <button
        className={`text-xs font-medium ${
          verified
            ? "text-emerald-700 hover:text-red-600"
            : "text-brand hover:underline"
        }`}
      >
        {verified ? "✓ Verified — tap to unverify" : "Mark verified"}
      </button>
    </form>
  );
}

export function Stat({
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

export function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { l: string; c: string }> = {
    pending: { l: "Pending review", c: "bg-amber-100 text-amber-900" },
    active: { l: "Live", c: "bg-emerald-100 text-emerald-800" },
    paused: { l: "Paused", c: "bg-line text-muted" },
    suspended: { l: "Suspended", c: "bg-red-100 text-red-800" },
  };
  const s = m[status] ?? m.pending;
  return <StatusPill label={s.l} className={s.c} />;
}

// How the entered permit lines up with the county list. Permit match (found +
// not expired) is what verifies; the NAME is advisory — cooks brand differently
// from their permit name, so a name gap is a "look closer," never a disqualifier.
export function MatchNote({
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
        ✗{" "}
        {cook.permit_number
          ? "permit not on the county list"
          : "no permit entered"}
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
  // Program mismatch: the permit auto-verifies on NUMBER alone (cottage +
  // MEHKO share PT… numbers), so a cook who picked the wrong program still
  // gets the badge — and a mis-tagged MEHKO cook silently loses all tax
  // tooling. Surface it here so the reviewer flips the type below before
  // approving. Only meaningful when both sides declare a type.
  const typeMismatch =
    op.operation_type && op.operation_type !== cook.operation_type;
  const label = (t: string) => (t === "mehko" ? "MEHKO" : "cottage food");
  return (
    <div className="mt-0.5">
      <p className="text-emerald-700">
        ✓ permit {op.permit_number} — {op.name}
      </p>
      {typeMismatch && (
        <p className="mt-0.5 text-red-600">
          ⚠ program mismatch — cook selected {label(cook.operation_type)} but
          this permit is on the {label(op.operation_type)} list. Fix the
          operation type below before approving.
        </p>
      )}
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
