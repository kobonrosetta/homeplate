import Link from "next/link";
import { signup } from "../actions";
import SignupForm from "@/components/signup-form";

export default function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string; intent?: string };
}) {
  // ?intent=sell — arriving from the cook pitch (/sell). Same form, cook-first
  // copy, and signup drops them straight into the wizard instead of /browse.
  const selling = searchParams.intent === "sell";
  return (
    <main className="mx-auto flex min-h-[78vh] max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-ink">Create your account</h1>
      <p className="mt-1 text-muted">
        {selling
          ? "One quick account, then straight into your kitchen application."
          : "Order from local kitchens — or start your own."}
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <SignupForm action={signup} selling={selling} />

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
