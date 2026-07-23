// Supabase client for use in browser ("use client") components.
import { createBrowserClient } from "@supabase/ssr";

// A single shared instance across the whole browser session. Creating a new
// client per call spins up multiple GoTrueClient instances that fight over the
// same auth lock, which can make getSession()/getUser() hang forever (this is
// what froze checkout on the deployed build). One instance = no lock contention.
let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return browserClient;
}
