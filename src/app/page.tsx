"use client";

import { useSession, signIn } from "@/lib/auth-client";
import { useState } from "react";

export default function Home() {
  const { data: session, isPending } = useSession();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchProfile() {
    if (!session?.user.dlaiJwtToken) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("https://platform-api.dlai.link/user/profile", {
        headers: {
          Authorization: `Bearer ${session.user.dlaiJwtToken}`,
        },
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      setProfile(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch profile");
    } finally {
      setLoading(false);
    }
  }

  if (isPending) {
    return <p>Loading session...</p>;
  }

  if (!session) {
    return (
      <div>
        <h1>Ymir Integration Example</h1>
        <p>Sign in to see your DLAI profile.</p>
        <button
          onClick={() => signIn.oauth2({ providerId: "dlai" })}
          style={{
            padding: "0.75rem 1.5rem",
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          Sign in with DLAI
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>Welcome, {session.user.name ?? session.user.email}!</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Session Info</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>
                <strong>Email:</strong>
              </td>
              <td>{session.user.email}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>
                <strong>DLAI User ID:</strong>
              </td>
              <td>{session.user.dlaiUserId ?? "N/A"}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0" }}>
                <strong>Has JWT Token:</strong>
              </td>
              <td>{session.user.dlaiJwtToken ? "Yes" : "No"}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Call DLAI API</h2>
        <button
          onClick={fetchProfile}
          disabled={loading || !session.user.dlaiJwtToken}
          style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          {loading ? "Loading..." : "Fetch Profile from DLAI API"}
        </button>

        {error && <p style={{ color: "red" }}>{error}</p>}

        {profile && (
          <pre
            style={{
              background: "#f5f5f5",
              padding: "1rem",
              marginTop: "1rem",
              overflow: "auto",
            }}
          >
            {JSON.stringify(profile, null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
