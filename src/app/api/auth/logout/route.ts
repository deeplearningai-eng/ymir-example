import { NextResponse } from "next/server";

export function POST() {
  const redirectUrl = `${process.env.NEXT_PUBLIC_AUTH_URL}/sign-out?callbackURL=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL!)}`;

  const response = NextResponse.json({ success: true, redirectUrl });

  // Clear local better-auth session cookie
  response.cookies.set("better-auth.session_token", "", {
    maxAge: 0,
    path: "/",
  });

  return response;
}
