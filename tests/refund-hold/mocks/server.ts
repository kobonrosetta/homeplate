// Test stand-in for lib/supabase/server.ts (see ../README.md): the signed-in
// cook's own database client. The test installs one that runs every
// statement as the 'authenticated' Postgres role, so the production order
// guard and the cancel-time trigger apply exactly as they do for a real cook.
export function createClient(): any {
  return (globalThis as any).__sessionDb;
}
