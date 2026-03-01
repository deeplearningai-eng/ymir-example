import { NextRequest, NextResponse } from "next/server";
import { auth, discoveryPromise } from "@/lib/auth";

const DLAI_COOKIE_NAME = "dlai_auth";
const SESSION_COOKIE_NAME = "better-auth.session_token";
const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
};

/**
 * POST /api/auth/logout
 *
 * Clears local cookies and redirects to the OIDC RP-Initiated Logout endpoint
 * on the auth server, which revokes the ymir session and redirects back.
 */
export async function POST(request: NextRequest) {
  // Read idToken before clearing
  const authCookie = request.cookies.get(DLAI_COOKIE_NAME);
  let idToken: string | undefined;
  if (authCookie?.value) {
    try {
      idToken = (JSON.parse(authCookie.value) as { idToken?: string }).idToken;
    } catch {
      // Cookie parsing failed
    }
  }

  // Try to use better-auth API to clear local session
  try {
    await auth.api.signOut({
      headers: request.headers,
    });
  } catch {
    // Ignore errors - we'll clear cookies manually
  }

  // Build OIDC RP-Initiated Logout URL
  const discovery = await discoveryPromise;
  const params = new URLSearchParams({
    client_id: process.env.DLAI_OAUTH_CLIENT_ID!,
    post_logout_redirect_uri: process.env.NEXT_PUBLIC_APP_URL!,
  });
  if (idToken) {
    params.set("id_token_hint", idToken);
  }
  const redirectUrl = `${discovery.endSessionEndpoint}?${params}`;

  const response = NextResponse.json({ success: true, redirectUrl });

  response.cookies.set(SESSION_COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);
  response.cookies.set(DLAI_COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);

  return response;
}
