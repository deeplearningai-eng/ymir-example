# Ymir Example

Minimal example showing how to integrate with [DLAI Auth Server (Ymir)](https://auth-dev.deeplearning.ai).

## Demo

https://github.com/user-attachments/assets/62701bfb-c651-4472-9186-51a8a270e3de

## What This Demonstrates

- Sign in via DLAI auth server (OAuth 2.1 + PKCE)
- Extract `dlaiJwtToken` from the session
- Call DLAI API (`/user/profile`) using the token
- **Automatic token refresh** when the DLAI JWT expires
- Federated logout via OIDC RP-Initiated Logout

## Quick Start

Dev credentials are included - just clone and run!

### 1. Clone and install

```bash
git clone https://github.com/deeplearningai-eng/ymir-example.git
cd ymir-example
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

The `.env.example` includes dev credentials that work with `auth-dev.deeplearning.ai`.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Sign in

Click "Sign in with DLAI" and use these test credentials:
- **Email**: `damon@deeplearning.ai`
- **Password**: `qwe`

## Project Structure

```
src/
├── lib/
│   ├── auth.ts         # Better Auth server config
│   ├── auth-client.ts  # React auth hooks
│   └── refresh.ts      # Server-side DLAI token refresh
└── app/
    ├── layout.tsx
    ├── page.tsx        # Demo UI
    └── api/
        ├── auth/
        │   ├── [...all]/route.ts  # Better Auth routes
        │   └── logout/route.ts    # OIDC RP-Initiated Logout
        └── profile/route.ts       # DLAI API proxy with auto-refresh
```

## How It Works

1. **User clicks "Sign in"** → Redirects to DLAI auth server
2. **User authenticates** → Google, LinkedIn, Apple, or email/password
3. **OAuth callback** → App fetches DLAI claims from `/oauth2/userinfo`
4. **Extract token** → `dlaiJwtToken` and raw `idToken` stored in cookie
5. **Call DLAI API** → Use token as Bearer auth
6. **Token expires** → Auto-refresh via Ymir userinfo + OAuth refresh token
7. **Sign out** → OIDC RP-Initiated Logout revokes both local and ymir sessions

## Key Code

### Auth Configuration (`src/lib/auth.ts`)

```typescript
genericOAuth({
  config: [{
    providerId: "dlai",
    discoveryUrl: `${AUTH_URL}/.well-known/openid-configuration`,
    // Token extraction happens in getUserInfo()
    async getUserInfo(tokens) {
      const res = await fetch(discovery.userinfoEndpoint, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      const claims = await res.json();
      // claims.dlaiJwtToken is the token for DLAI APIs
    },
  }],
})
```

### Using the Token

```typescript
const { data: session } = useSession();

// Call DLAI API
fetch("https://platform-api-dev.dlai.link/user/profile", {
  headers: {
    Authorization: `Bearer ${session.user.dlaiJwtToken}`,
  },
});
```

## Token Claims

The `/oauth2/userinfo` endpoint from Ymir returns:

| Claim | Type | Description |
|-------|------|-------------|
| `dlaiJwtToken` | string | JWT for calling DLAI APIs |
| `dlaiUserId` | number | DLAI user ID |
| `dlaiUserHash` | string | User hash for analytics |

## Production Setup

For production, you'll need your own OAuth credentials:

1. Contact the DLAI team to register your app
2. Provide your redirect URI: `https://your-app.com/api/auth/oauth2/callback/dlai`
3. Update `.env.local` with your credentials and `NEXT_PUBLIC_AUTH_URL=https://auth.deeplearning.ai`

## Token Refresh

DLAI JWT tokens expire after 30 days. When this happens, the app automatically refreshes them without requiring the user to re-login.

### How It Works

```
DLAI API returns 401 (token expired)
  → Exchange refresh token at Ymir /oauth2/token for new access token
  → Call Ymir /oauth2/userinfo with new access token
    → Ymir refreshes DLAI token internally and returns fresh claims
  → Update cookie with new tokens
  → Retry original DLAI API call
```

### Key Details

- The `offline_access` scope is requested during login to obtain a refresh token
- OAuth access tokens (30 days) and refresh tokens (60 days) are stored in the `dlai_auth` cookie alongside the DLAI JWT
- When Ymir's `/oauth2/userinfo` is called, it automatically refreshes the DLAI JWT via the upstream API
- The refresh logic lives in `src/lib/refresh.ts` and is called transparently by `src/app/api/profile/route.ts`
- The UI shows a green "Token was expired and has been refreshed" message when a refresh occurs

### Testing Token Refresh

1. Sign in normally
2. Open browser DevTools → Application → Cookies
3. Find the `dlai_auth` cookie and edit the `dlaiJwtToken` value (corrupt it or set it to `"expired"`)
4. Click "Fetch Profile from DLAI API"
5. The app should automatically refresh the token and show the profile with a green "refreshed" indicator

## Important: Tricky Parts

### 1. Redirect URI has `/oauth2/` in the path

Better-auth's `genericOAuth` plugin uses this callback pattern:
```
/api/auth/oauth2/callback/{providerId}
```

**NOT** `/api/auth/callback/{providerId}`. Make sure to register the correct URI:
```
http://localhost:3000/api/auth/oauth2/callback/dlai
```

### 2. Federated Logout (OIDC RP-Initiated Logout)

Signing out requires clearing **both** sessions:
- Local app session (better-auth)
- Ymir auth server session

The `/api/auth/logout` route uses standard OIDC RP-Initiated Logout:

```typescript
// 1. Read idToken from cookie before clearing
const idToken = JSON.parse(cookie).idToken;

// 2. Clear local session via better-auth API
await auth.api.signOut({ headers: request.headers });

// 3. Build OIDC end-session URL from discovery
const discovery = await discoveryPromise;
const params = new URLSearchParams({
  post_logout_redirect_uri: APP_URL,
});
if (idToken) {
  params.set("id_token_hint", idToken);
}
const redirectUrl = `${discovery.endSessionEndpoint}?${params}`;
```

The `idToken` is stored in the `dlai_auth` cookie during OAuth callback and passed as `id_token_hint` to prove the user initiated the logout.

Client calls this and redirects:
```typescript
const res = await fetch("/api/auth/logout", { method: "POST" });
const { redirectUrl } = await res.json();
window.location.href = redirectUrl;
```

Without this, users would auto-login after signing out (ymir session still exists).

### 3. Token Extraction Timing

The `dlaiJwtToken` is fetched from `/oauth2/userinfo` in `getUserInfo()` during OAuth callback. It's stored temporarily and passed to `customSession`. If the token is missing in session, check that `getUserInfo()` is properly fetching and storing it.

### 4. DLAI API Must Be Called Server-Side

The DLAI API doesn't allow browser CORS from localhost. Call it from a server-side API route:

```typescript
// src/app/api/profile/route.ts
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const token = session.user.dlaiJwtToken;

  // Server-side fetch - no CORS issues
  const res = await fetch(`${DLAI_API_URL}/user/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return NextResponse.json(await res.json());
}
```

Client calls your API route instead:
```typescript
const res = await fetch("/api/profile");
```

## Troubleshooting

### "Invalid redirect_uri"

Your callback URL must be registered with the OAuth client. Note the `/oauth2/` in the path:
```
http://localhost:3000/api/auth/oauth2/callback/dlai
```

### "Missing id_token"

Ensure your OAuth scopes include `openid`.

### Token not in session

Check that Ymir is returning claims from `/oauth2/userinfo`. The `dlaiJwtToken` is fetched during OAuth callback in `getUserInfo()`.

### Auto-login after sign out

You need to clear both local and ymir sessions. The `/api/auth/logout` route uses OIDC RP-Initiated Logout to revoke the ymir session. Make sure `idToken` is being stored in the cookie during OAuth callback.

## License

MIT
