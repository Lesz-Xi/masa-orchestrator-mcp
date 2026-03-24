"use client";

import { useState } from "react";

export function LoginPanel({ returnTo }: { returnTo?: string | null }) {
  const [password, setPassword] = useState("");
  const [operatorId, setOperatorId] = useState("internal-operator");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          password,
          operatorId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Login failed.");
      }

      window.location.href = returnTo || "/";
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed.");
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <div className="login-ambient" />
      <section className="login-panel">
        <div className="login-header">
          <div className="meta-chip">MASA / operator console</div>
          <h1>Enter the orchestration workbench.</h1>
          <p>
            This internal surface controls delegation state, benchmark truth, compliance scans, and
            consolidation output.
          </p>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            <span>Operator ID</span>
            <input value={operatorId} onChange={(event) => setOperatorId(event.target.value)} />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Shared internal credential"
            />
          </label>

          {error ? <div className="warning-card">{error}</div> : null}

          <button className="primary-button" type="submit" disabled={loading || password.length === 0}>
            {loading ? "Verifying…" : "Enter workbench"}
          </button>
        </form>
      </section>
    </main>
  );
}
