"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import styles from "./login.module.css";

function safeNextPath() {
  if (typeof window === "undefined") return "/";
  const value = new URLSearchParams(window.location.search).get("next") || "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function PartnerAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/partner-admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "The email or password is incorrect.");
      }
      window.location.assign(safeNextPath());
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="partner-admin-login-title">
        <div className={styles.brandRow}>
          <div className={styles.logoImage} role="img" aria-label="My Drip Nurse" />
          <div>
            <strong>My Drip Nurse</strong>
            <span>Partner Operations</span>
          </div>
        </div>

        <div className={styles.intro}>
          <span className={styles.eyebrow}>Secure administrator access</span>
          <h1 id="partner-admin-login-title">Welcome back.</h1>
          <p>Review partner applications and complete each controlled activation step.</p>
        </div>

        <form className={styles.form} onSubmit={submit}>
          <label>
            <span>Email address</span>
            <input
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              required
            />
          </label>

          <label className={styles.remember}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>Keep me signed in on this device</span>
          </label>

          {error ? <div className={styles.error} role="alert">{error}</div> : null}

          <button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <footer>
          <span>Independent My Drip Nurse administration</span>
          <span aria-hidden="true">•</span>
          <span>Encrypted session</span>
        </footer>
      </section>
    </main>
  );
}
