# Ymir Example

Minimal example showing how to integrate with [DLAI Auth Server (Ymir)](https://auth.deeplearning.ai).

## What This Demonstrates

- Sign in via DLAI auth server (OAuth 2.1 + PKCE)
- Extract `dlaiJwtToken` from the session
- Call DLAI API (`/user/profile`) using the token

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/deeplearningai/ymir-example.git
cd ymir-example
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your OAuth credentials (contact DLAI team to get these):

```bash
DLAI_OAUTH_CLIENT_ID=your-client-id
DLAI_OAUTH_CLIENT_SECRET=your-client-secret
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Getting OAuth Credentials

Contact the DLAI team to register your app. You'll need to provide:

- **App name**: Your application name
- **Redirect URI**: `http://localhost:3000/api/auth/callback/dlai` (for local dev)
- **Production URI**: Your production callback URL

## Project Structure

```
src/
├── lib/
│   ├── auth.ts         # Better Auth server config
│   └── auth-client.ts  # React auth hooks
└── app/
    ├── layout.tsx
    ├── page.tsx        # Demo UI
    └── api/auth/[...all]/route.ts  # Auth API endpoint
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
fetch("https://platform-api.dlai.link/user/profile", {
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

## Troubleshooting

### "Invalid redirect_uri"

Your callback URL must be registered. Contact DLAI team to add:
```
http://localhost:3000/api/auth/callback/dlai
```

### "Missing id_token"

Ensure your OAuth scopes include `openid`.

### Token not in session

Check that Ymir is returning claims in the id_token. The `dlaiJwtToken` is extracted during OAuth callback.

## License

MIT
