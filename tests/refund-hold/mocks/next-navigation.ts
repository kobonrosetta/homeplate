// Test stand-in for next/navigation (see ../README.md). Like the real one,
// redirect() never returns: it throws, and the test reads where it pointed.
export function redirect(url: string): never {
  const e = new Error(`REDIRECT ${url}`) as Error & { redirectTo: string };
  e.redirectTo = url;
  throw e;
}
