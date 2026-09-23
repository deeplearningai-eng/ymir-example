import type { NextRequest, NextResponse } from "next/server";

/**
 * Cookie name prefixes this app owns. Prefix-matching the live cookie jar
 * covers every variant Better Auth writes:
 * - `better-auth.session_token`, `.session_data`, `.account_data`, `.dont_remember`
 * - the `__Secure-` variants used when the app runs on https
 * - chunked cookies (`.session_data.0`, `.session_data.1`, ...) for large sessions
 */
const COOKIE_PREFIXES = ["better-auth.", "__Secure-better-auth.", "dlai_auth"];

/**
 * Expire every auth cookie this app set, on the given response.
 *
 * `__Secure-` cookies are only accepted with the Secure attribute, so the
 * attribute follows the cookie name (and https in production).
 */
export function clearAuthCookies(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const names = request.cookies
    .getAll()
    .map((c) => c.name)
    .filter((name) => COOKIE_PREFIXES.some((p) => name.startsWith(p)));

  for (const name of names) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure:
        name.startsWith("__Secure-") || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
