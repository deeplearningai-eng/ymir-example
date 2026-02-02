# Ymir Example

Minimal example showing how to integrate with [DLAI Auth Server (Ymir)](https://auth-dev.deeplearning.ai).

## What This Demonstrates

- Sign in via DLAI auth server (OAuth 2.1 + PKCE)
- Extract `dlaiJwtToken` from the session
- Call DLAI API (`/user/profile`) using the token

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
        └── logout/route.ts    # Federated logout
```

## How It Works

1. **User clicks "Sign in"** → Redirects to DLAI auth server
2. **User authenticates** → Google, LinkedIn, or email/password
3. **OAuth callback** → App receives `id_token` with DLAI claims
4. **Extract token** → `dlaiJwtToken` available in session
5. **Call DLAI API** → Use token as Bearer auth

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

### 2. Federated Logout (SSO)

Signing out requires clearing **both** sessions:
- Local app session (better-auth)
- Ymir auth server session

The `/api/auth/logout` route handles this:

```typescript
// 1. Clear local session via better-auth API
const signOutResponse = await auth.api.signOut({ headers: request.headers });

// 2. Return ymir sign-out URL for client to redirect
const redirectUrl = `${AUTH_URL}/sign-out?callbackURL=${APP_URL}`;
return NextResponse.json({ success: true, redirectUrl });
```

Client calls this and redirects:
```typescript
const res = await fetch("/api/auth/logout", { method: "POST" });
const { redirectUrl } = await res.json();
window.location.href = redirectUrl;
```

Without this, users would auto-login after signing out (ymir session still exists).

### 3. Token Extraction Timing

The `dlaiJwtToken` is extracted in `getUserInfo()` during OAuth callback. It's stored temporarily and passed to `customSession`. If the token is missing in session, check that `getUserInfo()` is properly extracting and storing it.

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

You need to clear both local and ymir sessions. Use the `/api/auth/logout` route pattern shown above.

## License

MIT
