import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Clear local session first
  const response = await auth.api.signOut({
    headers: request.headers,
  });

  // Build OIDC end_session URL
  const endSessionUrl = new URL(
    "/api/auth/oauth2/end-session",
    process.env.NEXT_PUBLIC_AUTH_URL
  );
  endSessionUrl.searchParams.set(
    "client_id",
    process.env.DLAI_OAUTH_CLIENT_ID!
  );
  endSessionUrl.searchParams.set(
    "post_logout_redirect_uri",
    process.env.NEXT_PUBLIC_APP_URL!
  );

  // Return redirect to clear ymir session
  return NextResponse.redirect(endSessionUrl.toString(), {
    headers: response.headers, // Include cookie clearing headers
  });
}
