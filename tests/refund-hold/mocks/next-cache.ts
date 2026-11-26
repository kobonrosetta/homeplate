// Test stand-in for next/cache (see ../README.md): outside a Next request
// there is no cache to revalidate.
export function revalidatePath(_path: string): void {}
