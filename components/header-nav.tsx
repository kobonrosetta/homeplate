"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import CartButton from "@/components/cart-button";
import { signout } from "@/app/(auth)/actions";

const linkCls = "text-muted hover:text-ink";

// The header's links. On desktop they sit inline; on a phone they collapse
// behind a hamburger so nothing spills into the logo. Defined once and rendered
// in both places so the two never drift apart.
export default function HeaderNav({
  signedIn,
  isCook,
  showAdmin,
  userLabel,
}: {
  signedIn: boolean;
  isCook: boolean;
  showAdmin: boolean;
  userLabel: string;
}) {
  const [open, setOpen] = useState(false);

  // Close the menu once navigation lands. Doing it here (rather than on the
  // link's click) avoids unmounting the link mid-click, which would cancel the
  // navigation itself.
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function Links({ mobile }: { mobile: boolean }) {
    const item = mobile ? `block py-2 ${linkCls}` : linkCls;
    const pill = mobile
      ? "block rounded-full border border-line px-4 py-2 text-center font-medium text-ink hover:bg-card"
      : "rounded-full border border-line px-4 py-2 font-medium text-ink hover:bg-card";
    const cta = mobile
      ? "block rounded-full bg-brand px-4 py-2 text-center font-medium text-white hover:bg-brand/90"
      : "rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand/90";
    return (
      <>
        <Link href="/browse" className={item}>
          Browse kitchens
        </Link>
        <CartButton />
        {signedIn ? (
          <>
            <Link href="/orders" className={item}>
              Purchases
            </Link>
            {isCook && (
              <Link href="/dashboard" className={pill}>
                My Kitchen
              </Link>
            )}
            {showAdmin && (
              <Link href="/admin" className={item}>
                Admin
              </Link>
            )}
            {userLabel && (
              <span
                className={
                  mobile
                    ? "block truncate py-1 text-faint"
                    : "hidden text-faint sm:inline"
                }
              >
                {userLabel}
              </span>
            )}
            <SignOut mobile={mobile} />
          </>
        ) : (
          <>
            <Link href="/login" className={item}>
              Sign in
            </Link>
            <Link href="/signup" className={cta}>
              Get started
            </Link>
          </>
        )}
      </>
    );
  }

  return (
    <>
      {/* Desktop — inline */}
      <nav className="hidden flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm sm:flex">
        <Links mobile={false} />
      </nav>

      {/* Mobile — hamburger toggles a dropdown */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="-mr-2 p-2 text-ink sm:hidden"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      {open && (
        <nav className="absolute inset-x-0 top-full z-50 flex flex-col gap-1 border-b border-line bg-bg px-6 py-3 text-sm shadow-lg sm:hidden">
          <Links mobile={true} />
        </nav>
      )}
    </>
  );
}

function SignOut({ mobile }: { mobile: boolean }) {
  return (
    <form action={signout} className={mobile ? "pt-1" : ""}>
      <button
        type="submit"
        className={`rounded-full border border-line px-4 py-2 font-medium text-ink hover:bg-card ${
          mobile ? "w-full" : ""
        }`}
      >
        Sign out
      </button>
    </form>
  );
}

function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
