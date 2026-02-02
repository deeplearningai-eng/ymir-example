/**
 * Better Auth client for React components
 */

import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [genericOAuthClient()],
});

export const { useSession, signIn, signOut } = authClient;
