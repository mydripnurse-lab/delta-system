"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

const BRAND_ICON_URL =
  "https://storage.googleapis.com/msgsndr/K8GcSVZWinRaQTMF6Sb8/media/698c5030a41b87368f94ef80.png";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = s(params.get("next")) || "/";
    setNextPath(next.startsWith("/") ? next : "/");
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const nextEmail = s(email).toLowerCase();
    const nextPassword = s(password);
    if (!nextEmail || !nextPassword) {
      setError("Email and password are required.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: nextEmail, password: nextPassword, rememberMe }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(s(json?.error) || "Unable to sign in.");
        return;
      }
      router.push(nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.grid}>
        <aside className={styles.hero}>
          <div>
            <div className={styles.brand}>
              <img src={BRAND_ICON_URL} alt="Delta System" />
              <p className={styles.brandTitle}>Delta System</p>
            </div>
            <h1 className={styles.headline}>AI growth infrastructure for every U.S. market.</h1>
            <p className={styles.subhead}>
              Delta System generates websites for every city, county, and state in the U.S., including Puerto Rico,
              then runs business operations with AI from one control tower.
            </p>
            <div className={styles.chips}>
              <span className={styles.chip}>Role-Based Access</span>
              <span className={styles.chip}>Tenant Isolation</span>
              <span className={styles.chip}>AI Operations</span>
            </div>
          </div>
        </aside>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Sign In</h2>
          <p className={styles.cardCopy}>Built for high-performance teams with security by default.</p>

          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${styles.tabOn}`}
            >
              Sign In
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className={`${styles.tab} ${styles.tabDisabled}`}
            >
              Create Account (Coming Soon)
            </button>
          </div>

          <form onSubmit={onSubmit} className={styles.form}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Password</span>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                autoComplete="current-password"
                required
              />
            </label>

            <label className={styles.remember}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Remember me (30 days)
            </label>

            {error ? <div className={styles.error}>{error}</div> : null}

            <button type="submit" disabled={busy} className={styles.submit}>
              {busy ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className={styles.hint}>
            Authorized users only. All actions are governed by permissions and audit controls.
          </p>
        </section>
      </section>
    </main>
  );
}
