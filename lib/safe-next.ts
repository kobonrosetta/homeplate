// Guard for post-auth redirect targets. A `?next=` param decides where a
// buyer lands after login/signup, so it must be an INTERNAL path only — never
// an absolute URL or protocol-relative "//host" that would let an attacker
// craft a HomePlate link that logs you in and bounces you to their site.
//
// Accept only paths that start with a single "/" and aren't "//" or "/\".
export function safeNext(
  next: string | null | undefined,
  fallback = "/browse"
): string {
  if (
    typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
  ) {
    return next;
  }
  return fallback;
}
