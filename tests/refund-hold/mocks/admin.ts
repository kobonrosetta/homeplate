// Test stand-in for lib/supabase/admin.ts (see ../README.md). The test installs
// a fake client that speaks the same query-builder calls against an
// in-process Postgres.
export function createAdminClient(): any {
  return (globalThis as any).__fakeDb;
}
