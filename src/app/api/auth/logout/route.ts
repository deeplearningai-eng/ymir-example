import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const DLAI_COOKIE_NAME = "dlai_account_data";

export async function POST(request: NextRequest) {
  // Use better-auth API to clear local session
  const signOutResponse = await auth.api.signOut({
    headers: request.headers,
  });

  const redirectUrl = `${process.env.NEXT_PUBLIC_AUTH_URL}/sign-out?callbackURL=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL!)}`;

  const response = NextResponse.json({ success: true, redirectUrl });

  // Copy cookie clearing headers from signOut response
  signOutResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      response.headers.append(key, value);
    }
  });

  // Also clear DLAI account data cookie
  response.cookies.set(DLAI_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
