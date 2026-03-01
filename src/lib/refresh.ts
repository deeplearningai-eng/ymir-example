/**
 * Server-side DLAI token refresh.
 *
 * Matches the paradis shared auth pattern:
 * 1. Exchange OAuth refresh token at Ymir /oauth2/token for new access token
 * 2. Fetch fresh DLAI claims from Ymir /oauth2/userinfo
 * 3. Update the dlai_auth cookie with fresh tokens + claims
 * 4. Clear cookies on any failure to force re-login
 */

import { NextRequest, NextResponse } from "next/server";
import {
  discoveryPromise,
  DLAI_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  CLEAR_COOKIE_OPTIONS,
} from "@/lib/auth";
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

/** Clear all auth cookies on the response to force re-login. */
export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(DLAI_COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);
  response.cookies.set(SESSION_COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);
}

/**
 * Attempt to refresh the DLAI JWT token.
 *
 * Returns fresh DlaiAccountData on success, or null if refresh failed.
 * When null is returned, caller should clear cookies via clearAuthCookies().
 */
export async function refreshDlaiToken(
  request: NextRequest,
): Promise<DlaiAccountData | null> {
  const stored = readCookie(request);
  if (!stored?.refreshToken) return null;

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

    if (!tokenRes.ok) return null;

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
    };

    if (!tokenData.access_token) return null;

    // Step 2: Fetch fresh DLAI claims from userinfo
    const userinfoRes = await fetch(discovery.userinfoEndpoint, {
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userinfoRes.ok) return null;

    const claims = (await userinfoRes.json()) as DlaiClaims;

    if (!claims.dlaiJwtToken || !claims.dlaiUserId || !claims.dlaiUserHash) {
      return null;
    }

    return {
      dlaiUserId: claims.dlaiUserId,
      dlaiJwtToken: claims.dlaiJwtToken,
      dlaiUserHash: claims.dlaiUserHash,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? stored.refreshToken,
      idToken: tokenData.id_token ?? stored.idToken,
    };
  } catch {
    return null;
  }
}
