import { NextRequest, NextResponse } from "next/server";
import { auth, DLAI_COOKIE_NAME, DLAI_COOKIE_OPTIONS } from "@/lib/auth";
import { clearAuthCookies } from "@/lib/clear-auth-cookies";
import { refreshDlaiToken } from "@/lib/refresh";

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
  const refresh = await refreshDlaiToken(request);
  if (refresh.status === "invalid") {
    return clearAuthCookies(
      request,
      NextResponse.json(
        { error: "DLAI token expired and refresh failed" },
        { status: 401 },
      ),
    );
  }
  if (refresh.status === "unavailable") {
    return NextResponse.json(
      { error: "Auth server unavailable, try again" },
      { status: 503 },
    );
  }

  // Retry DLAI API with refreshed token
  const retryRes = await callDlaiProfile(refresh.data.dlaiJwtToken);

  const response = retryRes.ok
    ? NextResponse.json({ ...(await retryRes.json()), refreshed: true })
    : NextResponse.json(
        { error: `DLAI API error after refresh: ${retryRes.status}` },
        { status: retryRes.status },
      );

  // Persist the rotated tokens on every path: ymir has already invalidated
  // the old refresh token, so dropping these would log the user out at the
  // next refresh.
  response.cookies.set(
    DLAI_COOKIE_NAME,
    JSON.stringify(refresh.data),
    DLAI_COOKIE_OPTIONS,
  );

  return response;
}
