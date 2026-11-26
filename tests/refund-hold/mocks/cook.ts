// Test stand-in for lib/cook.ts (see ../README.md): who is signed in. Each
// test sets it — a cook, a signed-in user with no kitchen, or nobody.
export async function getCurrentCook(): Promise<{ user: any; cook: any }> {
  return (globalThis as any).__session ?? { user: null, cook: null };
}
