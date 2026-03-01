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
- Single logout: signing out of any DLAI app signs you out here too (front-channel logout)

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
        │   ├── [...all]/route.ts       # Better Auth routes
        │   ├── logout/route.ts         # OIDC RP-Initiated Logout (starts a logout)
        │   └── logout-clear/route.ts   # Front-channel logout (receives a logout)
        └── profile/route.ts            # DLAI API proxy with auto-refresh
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Where this app runs (e.g., `http://localhost:3000`) |
| `SESSION_SECRET` | Min 32 chars, used by Better Auth for session encryption |
| `DLAI_OAUTH_CLIENT_ID` | OAuth client ID (from DLAI team) |
| `DLAI_OAUTH_CLIENT_SECRET` | OAuth client secret (from DLAI team) |
| `NEXT_PUBLIC_AUTH_URL` | Ymir auth server URL (`https://auth-dev.deeplearning.ai` for dev) |

## How It Works

```
Browser                     App Server                    Ymir Auth Server
  │                            │                               │
  │ Click "Sign in"            │                               │
  ├───────────────────────────►│                               │
  │                            │  GET /oauth2/authorize        │
  │  302 Redirect              │  (PKCE + state)               │
  │◄───────────────────────────├──────────────────────────────►│
  │                            │                               │
  │  User authenticates (Google/LinkedIn/Apple/email)          │
  │◄──────────────────────────────────────────────────────────►│
  │                            │                               │
  │  302 → /api/auth/oauth2/callback/dlai?code=...            │
  │────────────────────────────►│                               │
  │                            │  POST /oauth2/token           │
  │                            │  (exchange code for tokens)   │
  │                            ├──────────────────────────────►│
  │                            │◄──────────────────────────────┤
  │                            │                               │
  │                            │  GET /oauth2/userinfo         │
  │                            │  (fetch dlaiJwtToken, etc.)   │
  │                            ├──────────────────────────────►│
  │                            │◄──────────────────────────────┤
  │                            │                               │
  │  Set cookies:              │                               │
  │  - session_token           │                               │
  │  - dlai_auth (JWT, tokens) │                               │
  │◄───────────────────────────┤                               │
  │                            │                               │
  │  GET /api/profile          │                               │
  │────────────────────────────►│  GET /user/profile            │
  │                            ├──────────────────────────────►│ DLAI API
  │  Profile JSON              │◄──────────────────────────────┤
  │◄───────────────────────────┤                               │
```

### Sign-out Flow

```
Browser                     App Server                    Ymir Auth Server
  │                            │                               │
  │ POST /api/auth/logout      │                               │
  ├───────────────────────────►│  signOut() + clear cookies    │
  │                            ├──────────────────────────────►│
  │  { redirectUrl }           │                               │
  │◄───────────────────────────┤                               │
  │                            │                               │
  │  Navigate to end_session_endpoint?id_token_hint=...        │
  ├────────────────────────────────────────────────────────────►│
  │                            │  Revoke ymir session           │
  │  "Signing out…" page with one hidden iframe per DLAI app   │
  │◄────────────────────────────────────────────────────────────┤
  │  GET <each app>/api/auth/logout-clear (in iframes)         │
  │  → every app clears its own cookies                        │
  │  → post_logout_redirect_uri                                │
```

See [Single Logout](#5-single-logout-front-channel) for how the iframe step works.

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

### Using the Token (Server-Side)

DLAI API must be called from a server-side route (no browser CORS):

```typescript
// src/app/api/profile/route.ts
const session = await auth.api.getSession({ headers: request.headers });
const token = session.user.dlaiJwtToken;

const res = await fetch(`${DLAI_API_URL}/user/profile`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

Client calls your route:
```typescript
const res = await fetch("/api/profile");
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
3. Provide your front-channel logout URI: `https://your-app.deeplearning.ai/api/auth/logout-clear` (see [Single Logout](#5-single-logout-front-channel))
4. Update `.env.local` with your credentials and `NEXT_PUBLIC_AUTH_URL=https://auth.deeplearning.ai`

## Token Refresh

DLAI JWT tokens expire after 30 days. When this happens, the app automatically refreshes them without requiring the user to re-login.

### How It Works

```
DLAI API returns 401 (token expired)
  → Call Ymir /oauth2/userinfo with stored OAuth access token
    → If 401 (OAuth access token also expired):
      → Use refresh token at Ymir /oauth2/token to get new access token
      → Call /oauth2/userinfo again with new access token
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

### 5. Single Logout (front-channel)

`/api/auth/logout` (section 2) handles a logout that **starts in this app**. The
other half is a logout that **starts in another DLAI app** (www, learn,
corporate, ...). The user expects that to sign them out here too.

ymir does this with [OIDC Front-Channel Logout](https://openid.net/specs/openid-connect-frontchannel-1_0.html).
Whenever any app sends the user to `end_session_endpoint`, ymir returns a
"Signing out…" page that loads each registered client's
`frontchannel_logout_uri` in a hidden iframe, then redirects to the
`post_logout_redirect_uri`. This app's endpoint is `/api/auth/logout-clear`:

```typescript
// src/app/api/auth/logout-clear/route.ts
export function GET(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  return clearAuthCookies(request, response);
}
```

To enable it:

1. Deploy `/api/auth/logout-clear`.
2. Ask the DLAI team to set it as your OAuth client's **Frontchannel Logout URI**
   (one URI per client).
3. Keep your own logout going through `end_session_endpoint` (section 2).
   Otherwise, logging out here won't sign the user out of the other apps.

Requirements for the endpoint:

- **GET, no auth, idempotent.** ymir notifies every registered client on every
  logout, including apps this browser never signed into. For those it's a no-op.
- **Frameable by ymir.** Don't send `X-Frame-Options: DENY` or a CSP
  `frame-ancestors` that excludes the ymir origin, or the browser blocks the
  iframe.
- **Clear every cookie variant.** On https, Better Auth prefixes its cookies with
  `__Secure-` and splits large sessions into `.0`, `.1`, ... chunks.
  `clearAuthCookies` (`src/lib/clear-auth-cookies.ts`) expires everything in the
  cookie jar that starts with `better-auth.`, `__Secure-better-auth.` or
  `dlai_auth`, rather than a fixed list of names.

> **Same-site only.** The iframe runs inside the ymir page, so this app's cookies
> count as third-party there. Browsers ignore `SameSite=Lax` cookies set from a
> cross-site iframe. `SameSite=None` works in Chrome but not in Safari or Firefox.
> Front-channel logout is only reliable when your app is on a
> `*.deeplearning.ai` subdomain. It also won't work against `http://localhost`,
> since localhost is cross-site to `auth-dev.deeplearning.ai`. To test locally,
> map a same-site hostname (for example `example.local.deeplearning.ai`) to
> `127.0.0.1` in `/etc/hosts`.

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

### Still signed in here after logging out of another DLAI app

Check, in this order:

1. The client's Frontchannel Logout URI is registered in ymir and points at this deployment's `/api/auth/logout-clear`.
2. The app is on a `*.deeplearning.ai` subdomain (see the same-site note in section 5).
3. In the other app's logout, the "Signing out…" page's iframe request to `/api/auth/logout-clear` returns 200 with `Set-Cookie: ...; Max-Age=0` and isn't blocked by `X-Frame-Options`.

## License

MIT
