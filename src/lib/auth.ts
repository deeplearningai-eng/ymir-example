/**
 * Better Auth configuration for DLAI authentication
 *
 * This integrates with Ymir (DLAI auth server) using OAuth 2.1 + PKCE.
 * The dlaiJwtToken from the id_token can be used to call DLAI APIs.
 */

import { betterAuth } from "better-auth";
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

// Simple in-memory storage for demo (use cookies/DB in production)
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

    // Enrich session with DLAI-specific claims
    customSession(async ({ user, session }) => {
      const claims = pendingClaims;
      pendingClaims = null;

      return {
        user: {
          ...user,
          dlaiJwtToken: claims?.dlaiJwtToken ?? null,
          dlaiUserId: claims?.dlaiUserId ?? null,
          dlaiUserHash: claims?.dlaiUserHash ?? null,
        },
        session,
      };
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
