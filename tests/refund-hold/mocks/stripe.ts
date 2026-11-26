// Test stand-in for lib/stripe.ts createRefund (see ../README.md): each test
// scripts what "Stripe" answers, and every call is recorded.
export type RefundError = { error: string; code?: string; uncertain?: boolean };

export async function createRefund(
  paymentIntentId: string,
  idempotencyKey: string
): Promise<{ id: string } | RefundError> {
  const g = globalThis as any;
  g.__stripeCalls.push({ paymentIntentId, idempotencyKey });
  return g.__stripe(paymentIntentId, idempotencyKey);
}
