import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signout } from "@/app/(auth)/actions";
import { isAdminEmail } from "@/lib/admin";
import CartButton from "@/components/cart-button";

const linkClass = "text-muted hover:text-ink";

// Global header. Role-aware: a cook leads with their kitchen; a buyer leads
// with browsing; a signed-out visitor sees sign-in.
export default async function SiteHeader() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isCook = false;
  if (user) {
    const { data: cooks } = await supabase
      .from("cooks")
      .select("id")
      .eq("profile_id", user.id)
      .limit(1);
    isCook = Boolean(cooks && cooks.length);
  }

  const userLabel = user?.is_anonymous ? "Guest" : user?.email ?? "";
  const showAdmin = isAdminEmail(user?.email);

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">
            HomePlate
          </span>
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
          {user && isCook ? (
            <>
              <Link href="/browse" className={linkClass}>
                Browse kitchens
              </Link>
              <CartButton />
              <Link href="/orders" className={linkClass}>
                Purchases
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-line px-4 py-2 font-medium text-ink hover:bg-card"
              >
                My Kitchen
              </Link>
              {showAdmin && (
                <Link href="/admin" className={linkClass}>
                  Admin
                </Link>
              )}
              <span className="hidden text-faint sm:inline">{userLabel}</span>
              <SignOut />
            </>
          ) : user ? (
            <>
              <Link href="/browse" className={linkClass}>
                Browse kitchens
              </Link>
              <CartButton />
              <Link href="/orders" className={linkClass}>
                Purchases
              </Link>
              <span className="hidden text-faint sm:inline">{userLabel}</span>
              <SignOut />
            </>
          ) : (
            <>
              <Link href="/browse" className={linkClass}>
                Browse kitchens
              </Link>
              <CartButton />
              <Link href="/login" className={linkClass}>
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand/90"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function SignOut() {
  return (
    <form action={signout}>
      <button
        type="submit"
        className="rounded-full border border-line px-4 py-2 font-medium text-ink hover:bg-card"
      >
        Sign out
      </button>
    </form>
  );
}
