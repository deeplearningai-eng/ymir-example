import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const DLAI_API_URL =
  process.env.DLAI_API_URL || "https://platform-api-dev.dlai.link";

export async function GET(request: NextRequest) {
  // Get session with dlaiJwtToken
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = (session.user as { dlaiJwtToken?: string }).dlaiJwtToken;
  if (!token) {
    return NextResponse.json({ error: "No DLAI token" }, { status: 401 });
  }

  // Call DLAI API server-side (no CORS issues)
  const res = await fetch(`${DLAI_API_URL}/user/profile`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `DLAI API error: ${res.status}` },
      { status: res.status }
    );
  }

  const profile = await res.json();
  return NextResponse.json(profile);
}
