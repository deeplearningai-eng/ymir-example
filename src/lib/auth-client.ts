/**
 * Better Auth client for React components
 */

import { createAuthClient } from "better-auth/react";
import {
  customSessionClient,
  genericOAuthClient,
} from "better-auth/client/plugins";
import type { auth } from "./auth";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  // customSessionClient infers the DLAI fields that customSession() adds on
  // the server (dlaiJwtToken, dlaiUserId, dlaiUserHash) into useSession().
  plugins: [genericOAuthClient(), customSessionClient<typeof auth>()],
});

export const { useSession, signIn, signOut } = authClient;
