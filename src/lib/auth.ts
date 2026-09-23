/**
 * Better Auth configuration for DLAI authentication
 *
 * This integrates with Ymir (DLAI auth server) using OAuth 2.1 + PKCE.
 * The dlaiJwtToken from userinfo can be used to call DLAI APIs.
 *
 * Flow:
 * 1. getUserInfo() fetches DLAI claims from /oauth2/userinfo via access token
 * 2. after hook stores claims in cookie during OAuth callback
 * 3. customSession() reads claims from cookie for every session request
 */

import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { customSession, genericOAuth } from "better-auth/plugins";

export interface DlaiClaims {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  dlaiJwtToken?: string;
  dlaiUserId?: number;
  dlaiUserHash?: string;
}

export interface DlaiAccountData {
  dlaiJwtToken: string;
  dlaiUserId: number;
  dlaiUserHash?: string;
  /** OAuth access token for calling Ymir endpoints (e.g. /oauth2/userinfo) */
  accessToken?: string;
  /**
   * OAuth refresh token for obtaining new access tokens when expired. Absent
   * if ymir didn't grant `offline_access`; the app then works until the DLAI
   * JWT expires and the user signs in again.
   */
  refreshToken?: string;
  /** Raw OIDC id_token JWT — used for RP-Initiated Logout (id_token_hint) */
  idToken?: string;
}

export const DLAI_COOKIE_NAME = "dlai_auth";

export const DLAI_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

type PendingClaims = DlaiClaims & {
  rawIdToken?: string;
  accessToken?: string;
  refreshToken?: string;
  createdAt: number;
};

/**
 * Claims handed from getUserInfo() to the callback's after hook, keyed by the
 * signing-in user's email. A single module variable would let two concurrent
 * logins swap claims, giving one user's browser the other user's tokens.
 * Entries from callbacks that never reach the hook (e.g. a failed sign-in)
 * are dropped after PENDING_TTL_MS.
 */
const pendingClaims = new Map<string, PendingClaims>();
const PENDING_TTL_MS = 60_000;

function prunePendingClaims(now: number) {
  for (const [key, value] of pendingClaims) {
    if (now - value.createdAt > PENDING_TTL_MS) pendingClaims.delete(key);
  }
}

const DISCOVERY_URL = `${process.env.NEXT_PUBLIC_AUTH_URL}/.well-known/openid-configuration`;

/** Cached OIDC discovery (reused by genericOAuth and logout) */
export const discoveryPromise = fetch(DISCOVERY_URL)
  .then(
    (res) =>
      res.json() as Promise<{
        userinfo_endpoint: string;
        token_endpoint: string;
        end_session_endpoint: string;
      }>,
  )
  .then((data) => ({
    userinfoEndpoint: data.userinfo_endpoint,
    tokenEndpoint: data.token_endpoint,
    endSessionEndpoint: data.end_session_endpoint,
  }));

export const auth = betterAuth({
  baseURL: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth`,
  secret: process.env.SESSION_SECRET!,
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL!,
    process.env.NEXT_PUBLIC_AUTH_URL!,
  ],

  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "dlai",
          clientId: process.env.DLAI_OAUTH_CLIENT_ID!,
          clientSecret: process.env.DLAI_OAUTH_CLIENT_SECRET!,
          discoveryUrl: DISCOVERY_URL,
          scopes: ["openid", "profile", "email", "offline_access"],
          pkce: true,
          // Force login form even if ymir has a session
          authorizationUrlParams: {
            prompt: "login",
          },

          async getUserInfo(tokens) {
            const discovery = await discoveryPromise;
            const res = await fetch(discovery.userinfoEndpoint, {
              headers: { Authorization: `Bearer ${tokens.accessToken}` },
            });
            if (!res.ok) {
              throw new Error("Failed to fetch userinfo");
            }
            const claims = (await res.json()) as DlaiClaims;

            if (!claims.sub) {
              throw new Error("Missing sub claim in userinfo response");
            }

            const now = Date.now();
            prunePendingClaims(now);
            pendingClaims.set(claims.email ?? "", {
              ...claims,
              rawIdToken: tokens.idToken,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              createdAt: now,
            });

            return {
              id: claims.sub,
              email: claims.email ?? "",
              name: claims.name,
              image: claims.picture,
              emailVerified: true,
            };
          },
        },
      ],
    }),

    // Read DLAI claims from cookie for every session request
    customSession(async ({ user, session }, ctx) => {
      let data: DlaiAccountData | null = null;
      try {
        const cookie = ctx.getCookie(DLAI_COOKIE_NAME);
        if (cookie) {
          data = JSON.parse(cookie) as DlaiAccountData;
        }
      } catch {
        // Cookie parsing failed
      }

      return {
        user: {
          ...user,
          dlaiJwtToken: data?.dlaiJwtToken ?? null,
          dlaiUserId: data?.dlaiUserId ?? null,
          dlaiUserHash: data?.dlaiUserHash ?? null,
        },
        session,
      };
    }),
  ],

  hooks: {
    // Store DLAI claims in cookie during OAuth callback
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.includes("/callback/")) {
        return;
      }

      // newSession is the session this callback just created; its email is
      // the key getUserInfo() stored the claims under.
      const email = ctx.context.newSession?.user.email;
      if (email === undefined) return;
      const claims = pendingClaims.get(email);
      pendingClaims.delete(email);

      if (claims?.dlaiJwtToken && claims.dlaiUserId) {
        ctx.setCookie(
          DLAI_COOKIE_NAME,
          JSON.stringify({
            dlaiJwtToken: claims.dlaiJwtToken,
            dlaiUserId: claims.dlaiUserId,
            dlaiUserHash: claims.dlaiUserHash,
            accessToken: claims.accessToken,
            refreshToken: claims.refreshToken,
            idToken: claims.rawIdToken,
          }),
          DLAI_COOKIE_OPTIONS
        );
      }
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
