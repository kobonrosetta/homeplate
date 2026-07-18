import { createClient } from "@/lib/supabase/server";
import CheckoutForm from "@/components/checkout-form";
import { FormError } from "@/components/form";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No login wall: guests can check out. Only prefill for a real (non-anonymous)
  // signed-in account.
  const signedIn = Boolean(user && !user.is_anonymous);
  let defaultName = "";
  let defaultPhone = "";
  let defaultEmail = "";
  if (signedIn && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle();
    defaultName = profile?.full_name ?? "";
    defaultPhone = profile?.phone ?? "";
    defaultEmail = user.email ?? "";
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Checkout</h1>
      <div className="mt-4">
        <FormError message={searchParams.error} />
      </div>
      <CheckoutForm
        defaultName={defaultName}
        defaultPhone={defaultPhone}
        defaultEmail={defaultEmail}
        signedIn={signedIn}
      />
    </main>
  );
}
