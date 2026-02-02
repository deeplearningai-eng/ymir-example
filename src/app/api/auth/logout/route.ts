import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const DLAI_COOKIE_NAME = "dlai_account_data";
const SESSION_COOKIE_NAME = "better-auth.session_token";

export async function POST(request: NextRequest) {
  // Try to use better-auth API to clear local session
  try {
    await auth.api.signOut({
      headers: request.headers,
    });
  } catch {
    // Ignore errors - we'll clear cookies manually
  }

  const redirectUrl = `${process.env.NEXT_PUBLIC_AUTH_URL}/sign-out?callbackURL=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL!)}`;

  const response = NextResponse.json({ success: true, redirectUrl });

  // Clear session cookie
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  // Clear DLAI account data cookie
  response.cookies.set(DLAI_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
