import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // The pre-rename Render hostname still serves the full site (no redirect),
  // splitting links/SEO across two live hosts. 301 everything to the real
  // domain; Stripe webhooks are unaffected (they're configured against
  // forkfork.app, and webhook POSTs shouldn't hit the old host anyway).
  const host = request.headers.get("host") ?? "";
  if (host === "homeplate-jyd2.onrender.com") {
    const url = new URL(request.url);
    url.host = "forkfork.app";
    url.port = "";
    return NextResponse.redirect(url, 301);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
