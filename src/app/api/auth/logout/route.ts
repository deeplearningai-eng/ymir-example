import { NextResponse } from "next/server";

export function POST() {
  const redirectUrl = `${process.env.NEXT_PUBLIC_AUTH_URL}/sign-out?callbackURL=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL!)}`;

  // Return redirect URL - client will navigate
  // Note: In production, also clear any local session cookies here
  return NextResponse.json({ success: true, redirectUrl });
}
