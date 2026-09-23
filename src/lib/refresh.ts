/**
 * Server-side DLAI token refresh.
 *
 * Matches the paradis shared auth pattern:
 * 1. Exchange OAuth refresh token at Ymir /oauth2/token for new access token
 * 2. Fetch fresh DLAI claims from Ymir /oauth2/userinfo
 * 3. Update the dlai_auth cookie with fresh tokens + claims
 * 4. Clear cookies on any failure to force re-login
 */

import { NextRequest } from "next/server";
import { discoveryPromise, DLAI_COOKIE_NAME } from "@/lib/auth";
import type { DlaiAccountData, DlaiClaims } from "@/lib/auth";

/** Read and parse the dlai_auth cookie from the request. */
function readCookie(request: NextRequest): DlaiAccountData | null {
  const raw = request.cookies.get(DLAI_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DlaiAccountData;
  } catch {
    return null;
  }
}

/**
 * - `ok`: fresh tokens. Write them to the cookie even if the follow-up API
 *   call fails, because ymir has already rotated the refresh token.
 * - `invalid`: the refresh token is gone, expired, or revoked (e.g. the user
 *   logged out at ymir). Clear the cookies so the user signs in again.
 * - `unavailable`: ymir timed out or errored. Keep the cookies and let the
 *   next request retry, rather than logging the user out over a blip.
 */
export type RefreshResult =
  | { status: "ok"; data: DlaiAccountData }
  | { status: "invalid" }
  | { status: "unavailable" };

/** Attempt to refresh the DLAI JWT token. */
export async function refreshDlaiToken(
  request: NextRequest,
): Promise<RefreshResult> {
  const stored = readCookie(request);
  if (!stored?.refreshToken) return { status: "invalid" };

  try {
    const discovery = await discoveryPromise;

    // Step 1: Exchange refresh token for new access token
    const tokenRes = await fetch(discovery.tokenEndpoint, {
      signal: AbortSignal.timeout(5000),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: stored.refreshToken,
        client_id: process.env.DLAI_OAUTH_CLIENT_ID!,
        client_secret: process.env.DLAI_OAUTH_CLIENT_SECRET!,
      }),
    });

    // RFC 6749 §5.2: a bad/expired/revoked grant is a 400 (invalid_grant);
    // a bad client is a 401. Anything else is a server-side problem.
    if (tokenRes.status === 400 || tokenRes.status === 401) {
      return { status: "invalid" };
    }
    if (!tokenRes.ok) return { status: "unavailable" };

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
    };

    if (!tokenData.access_token) return { status: "unavailable" };

    // Step 2: Fetch fresh DLAI claims from userinfo
    const userinfoRes = await fetch(discovery.userinfoEndpoint, {
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userinfoRes.ok) return { status: "unavailable" };

    const claims = (await userinfoRes.json()) as DlaiClaims;

    if (!claims.dlaiJwtToken || !claims.dlaiUserId) {
      return { status: "unavailable" };
    }

    return {
      status: "ok",
      data: {
        dlaiUserId: claims.dlaiUserId,
        dlaiJwtToken: claims.dlaiJwtToken,
        dlaiUserHash: claims.dlaiUserHash,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? stored.refreshToken,
        idToken: tokenData.id_token ?? stored.idToken,
      },
    };
  } catch {
    // Network error or the 5s timeout
    return { status: "unavailable" };
  }
}
