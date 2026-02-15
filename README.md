# Ymir Example

Minimal example showing how to integrate with [DLAI Auth Server (Ymir)](https://auth-dev.deeplearning.ai).

## Demo

https://github.com/user-attachments/assets/62701bfb-c651-4472-9186-51a8a270e3de

## What This Demonstrates

- Sign in via DLAI auth server (OAuth 2.1 + PKCE)
- Extract `dlaiJwtToken` from the session
- Call DLAI API (`/user/profile`) using the token
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
│   └── auth-client.ts  # React auth hooks
└── app/
    ├── layout.tsx
    ├── page.tsx        # Demo UI
    └── api/auth/
        ├── [...all]/route.ts  # Better Auth routes
        └── logout/route.ts    # OIDC RP-Initiated Logout
```

## How It Works

1. **User clicks "Sign in"** → Redirects to DLAI auth server
2. **User authenticates** → Google, LinkedIn, or email/password
3. **OAuth callback** → App receives `id_token` with DLAI claims
4. **Extract token** → `dlaiJwtToken` and raw `idToken` stored in cookie
5. **Call DLAI API** → Use token as Bearer auth
6. **Sign out** → OIDC RP-Initiated Logout revokes both local and ymir sessions

## Key Code

### Auth Configuration (`src/lib/auth.ts`)

```typescript
genericOAuth({
  config: [{
    providerId: "dlai",
    discoveryUrl: `${AUTH_URL}/.well-known/openid-configuration`,
    // Token extraction happens in getUserInfo()
    async getUserInfo(tokens) {
      const claims = decodeJwt(tokens.idToken!);
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

The `id_token` from Ymir contains:

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

The `idToken` is stored in the `dlai_account_data` cookie during OAuth callback and passed as `id_token_hint` to prove the user initiated the logout.

Client calls this and redirects:
```typescript
const res = await fetch("/api/auth/logout", { method: "POST" });
const { redirectUrl } = await res.json();
window.location.href = redirectUrl;
```

Without this, users would auto-login after signing out (ymir session still exists).

### 3. Token Extraction Timing

The `dlaiJwtToken` is extracted in `getUserInfo()` during OAuth callback. It's stored temporarily and passed to `customSession`. If the token is missing in session, check that `getUserInfo()` is properly extracting and storing it.

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

Check that Ymir is returning claims in the id_token. The `dlaiJwtToken` is extracted during OAuth callback in `getUserInfo()`.

### Auto-login after sign out

You need to clear both local and ymir sessions. The `/api/auth/logout` route uses OIDC RP-Initiated Logout to revoke the ymir session. Make sure `idToken` is being stored in the cookie during OAuth callback.

## License

MIT
