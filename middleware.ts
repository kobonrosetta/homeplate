import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // The pre-rename Render hostname still serves the full site (no redirect),
  // splitting links/SEO across two live hosts. 301 BROWSER traffic to the
  // real domain — but never /api/*: machine callers (Stripe webhooks, cron
  // curls) treat a 3xx as delivery failure, and DEPLOY.md records at least
  // one Stripe endpoint configured against the old host. Redirecting those
  // would silently kill webhook payment confirmation (review blocker on
  // #121). Serving /api on both hosts is harmless; redirecting it is not.
  const host = request.headers.get("host") ?? "";
  if (
    host === "homeplate-jyd2.onrender.com" &&
    !request.nextUrl.pathname.startsWith("/api/")
  ) {
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
