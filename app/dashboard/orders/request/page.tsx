import Link from "next/link";
import { TextField, SubmitButton, FormError } from "@/components/form";
import { createPaymentRequest } from "../request-actions";

export const dynamic = "force-dynamic";

// Mint a payment link for a custom order agreed in DMs. Four fields, one tap,
// copy the link into the chat — the replacement for "Venmo me at…".
export default function NewPaymentRequestPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold text-ink">New payment request</h2>
      <p className="mt-1 text-sm text-muted">
        Agreed on a custom order over DM? Create a link your buyer can pay with
        a card — instead of chasing a Venmo. You keep 100% of your price; the
        buyer pays the service fee.
      </p>

      <form action={createPaymentRequest} className="mt-5 space-y-5">
        <FormError message={searchParams.error} />
        <TextField
          label="What's it for"
          name="title"
          required
          placeholder={'e.g. Dinosaur birthday cake, 8"'}
        />
        <TextField
          label="Your price ($)"
          name="price"
          required
          placeholder="95"
        />
        <div className="space-y-2 rounded-xl bg-card p-4 shadow-soft">
          <p className="text-sm font-medium text-ink">Collect now</p>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" name="charge_kind" value="full" defaultChecked />
            Full amount
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" name="charge_kind" value="deposit" />
            50% deposit now — arrange the rest at pickup
          </label>
        </div>
        <TextField
          label="Pickup date/time (optional)"
          name="pickup_date"
          placeholder="e.g. Sat Aug 14, 10am, Campbell"
        />
        <TextField
          label="Note to the buyer (optional)"
          name="note"
          placeholder="e.g. Deposits are non-refundable within 48h of pickup"
        />
        <SubmitButton>Create payment link</SubmitButton>
      </form>

      <p className="mt-4 text-xs text-faint">
        Links expire after 7 days if unpaid. You can cancel one anytime from
        the{" "}
        <Link href="/dashboard/orders" className="underline hover:no-underline">
          Orders
        </Link>{" "}
        tab.
      </p>
    </div>
  );
}
