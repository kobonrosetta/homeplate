import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import HeaderNav from "@/components/header-nav";

// Global header. Role-aware: a cook leads with their kitchen; a buyer leads
// with browsing; a signed-out visitor sees sign-in. The links themselves live
// in HeaderNav (a client component) so they can collapse into a mobile menu.
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
    <header className="relative border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">
            HomePlate
          </span>
        </Link>

        <HeaderNav
          signedIn={Boolean(user)}
          isCook={isCook}
          showAdmin={showAdmin}
          userLabel={userLabel}
        />
      </div>
    </header>
  );
}
