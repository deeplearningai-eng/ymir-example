import { NextRequest, NextResponse } from "next/server";
import { auth, DLAI_COOKIE_NAME, DLAI_COOKIE_OPTIONS } from "@/lib/auth";
import { refreshDlaiToken, clearAuthCookies } from "@/lib/refresh";

const DLAI_API_URL =
  process.env.DLAI_API_URL || "https://platform-api-dev.dlai.link";

async function callDlaiProfile(token: string) {
  return fetch(`${DLAI_API_URL}/user/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function GET(request: NextRequest) {
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
  const res = await callDlaiProfile(token);

  // If not a 401, return as-is
  if (res.status !== 401) {
    if (!res.ok) {
      return NextResponse.json(
        { error: `DLAI API error: ${res.status}` },
        { status: res.status },
      );
    }
    const profile = await res.json();
    return NextResponse.json(profile);
  }

  // 401 — attempt token refresh
  const refreshed = await refreshDlaiToken(request);
  if (!refreshed) {
    const response = NextResponse.json(
      { error: "DLAI token expired and refresh failed" },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  }

  // Retry DLAI API with refreshed token
  const retryRes = await callDlaiProfile(refreshed.dlaiJwtToken);

  if (!retryRes.ok) {
    return NextResponse.json(
      { error: `DLAI API error after refresh: ${retryRes.status}` },
      { status: retryRes.status },
    );
  }

  const profile = await retryRes.json();
  const response = NextResponse.json({ ...profile, refreshed: true });

  // Update cookie with refreshed tokens
  response.cookies.set(
    DLAI_COOKIE_NAME,
    JSON.stringify(refreshed),
    DLAI_COOKIE_OPTIONS,
  );

  return response;
}
