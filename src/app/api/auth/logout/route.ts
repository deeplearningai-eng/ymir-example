import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Clear local session first
  const response = await auth.api.signOut({
    headers: request.headers,
  });

  // Redirect to ymir's sign-out page to clear auth server session
  const signOutUrl = new URL("/sign-out", process.env.NEXT_PUBLIC_AUTH_URL);
  signOutUrl.searchParams.set("callbackURL", process.env.NEXT_PUBLIC_APP_URL!);

  // Return redirect to clear ymir session
  return NextResponse.redirect(signOutUrl.toString(), {
    headers: response.headers, // Include cookie clearing headers
  });
}
