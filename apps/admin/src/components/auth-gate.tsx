import type { ReactNode } from "react";
import { useState } from "react";
import { client } from "../lib/client";

export function AuthGate(props: { children: ReactNode }) {
  const session = client.auth.useSession();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (session.isPending) {
    return (
      <div className="content">
        <section className="panel">
          <h2>Loading session</h2>
          <p className="muted">Checking Better Auth session state.</p>
        </section>
      </div>
    );
  }

  if (!session.data) {
    return (
      <div className="content">
        <section className="panel" style={{ maxWidth: 520, margin: "10vh auto" }}>
          <div className="hero">
            <span className="badge">Superadmin login</span>
            <h2>Sign in to Authend</h2>
            <p className="muted">
              Use the seeded superadmin credentials from your environment or the local defaults.
            </p>
          </div>

          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError(null);
              const result = await client.auth.signIn.email({
                email,
                password,
              });
              if (result.error) {
                setError(result.error.message);
              }
              setPending(false);
            }}
          >
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? <p style={{ color: "#b2432f", margin: 0 }}>{error}</p> : null}
            <button className="button" disabled={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return <>{props.children}</>;
}
