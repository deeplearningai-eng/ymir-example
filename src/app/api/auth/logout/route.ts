import { NextResponse } from "next/server";

export async function POST() {
  // Redirect to ymir's sign-out - it clears the auth session and redirects back
  const signOutUrl = new URL("/sign-out", process.env.NEXT_PUBLIC_AUTH_URL);
  signOutUrl.searchParams.set("callbackURL", process.env.NEXT_PUBLIC_APP_URL!);
  return NextResponse.redirect(signOutUrl.toString());
}
