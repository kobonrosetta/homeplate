// Supabase client for use in server components, route handlers, and actions.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Since Next 15, cookies() is asynchronous. It is still CALLED here, inside
// the request, exactly as before; the two hooks below wait for it. That keeps
// createClient() itself synchronous, so none of its ~40 call sites had to
// change (the Supabase helper accepts asynchronous cookie hooks and waits for
// them). Do not turn createClient() into an async function to "tidy" this:
// every caller would then need an await, and one missed await is a signed-out
// page.
export function createClient() {
  const cookieStore = cookies();
  // If this was somehow called outside a request, the failure belongs to the
  // first real use below, not to an unhandled promise in the background.
  cookieStore.catch(() => {});

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return (await cookieStore).getAll();
        },
        async setAll(cookiesToSet: CookieToSet[]) {
          try {
            const store = await cookieStore;
            cookiesToSet.forEach(({ name, value, options }) =>
              store.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // is refreshing sessions.
          }
        },
      },
    }
  );
}
