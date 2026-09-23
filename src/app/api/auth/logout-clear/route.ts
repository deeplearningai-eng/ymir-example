import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/clear-auth-cookies";

/**
 * GET /api/auth/logout-clear
 *
 * Front-channel logout target. When the user signs out of ANY DLAI app, ymir's
 * end-session page loads this URL in a hidden iframe so this app drops its
 * session too. Register it as the OAuth client's `frontchannel_logout_uri`.
 *
 * Must stay:
 * - GET, unauthenticated, and idempotent (ymir notifies every registered
 *   client, including ones this browser never signed into)
 * - embeddable in an iframe from the ymir origin (no `X-Frame-Options: DENY`)
 *
 * Only reliable when this app is same-site with ymir (`*.deeplearning.ai`):
 * browsers drop `SameSite=Lax` Set-Cookie headers in a cross-site iframe.
 */
export function GET(request: NextRequest) {
  const response = new NextResponse(null, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
  return clearAuthCookies(request, response);
}
