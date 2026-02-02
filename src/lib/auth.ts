/**
 * Better Auth configuration for DLAI authentication
 *
 * This integrates with Ymir (DLAI auth server) using OAuth 2.1 + PKCE.
 * The dlaiJwtToken from the id_token can be used to call DLAI APIs.
 *
 * Flow:
 * 1. getUserInfo() extracts DLAI claims from id_token, stores in pendingClaims
 * 2. after hook stores claims in cookie during OAuth callback
 * 3. customSession() reads claims from cookie for every session request
 */

import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { customSession, genericOAuth } from "better-auth/plugins";
import { decodeJwt } from "jose";

interface DlaiClaims {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  dlaiJwtToken?: string;
  dlaiUserId?: number;
  dlaiUserHash?: string;
}

interface DlaiAccountData {
  dlaiJwtToken: string;
  dlaiUserId: number;
  dlaiUserHash?: string;
}

const DLAI_COOKIE_NAME = "dlai_account_data";

// Temporary storage for passing claims from getUserInfo to after hook
let pendingClaims: DlaiClaims | null = null;

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
          discoveryUrl: `${process.env.NEXT_PUBLIC_AUTH_URL}/.well-known/openid-configuration`,
          scopes: ["openid", "profile", "email"],
          pkce: true,

          async getUserInfo(tokens) {
            const idToken = tokens.idToken;
            if (!idToken) {
              throw new Error("Missing id_token in OAuth response");
            }

            const claims = decodeJwt(idToken) as DlaiClaims;
            pendingClaims = claims;

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

      const claims = pendingClaims;
      pendingClaims = null;

      if (claims?.dlaiJwtToken && claims.dlaiUserId) {
        ctx.setCookie(
          DLAI_COOKIE_NAME,
          JSON.stringify({
            dlaiJwtToken: claims.dlaiJwtToken,
            dlaiUserId: claims.dlaiUserId,
            dlaiUserHash: claims.dlaiUserHash,
          }),
          {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 30, // 30 days
          }
        );
      }
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
