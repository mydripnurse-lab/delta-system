"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./activate.module.css";

const BRAND_ICON_URL =
  "https://storage.googleapis.com/msgsndr/K8GcSVZWinRaQTMF6Sb8/media/698c5030a41b87368f94ef80.png";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function ActivatePageInner() {
  const search = useSearchParams();
  const router = useRouter();
  const token = useMemo(() => s(search.get("token")), [search]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) {
      setError("Missing activation token.");
      return;
    }
    if (s(password) !== s(confirmPassword)) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password: s(password) }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setOk("Password updated. Redirecting to login...");
      setTimeout(() => router.push("/login"), 1100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Activation failed.");
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
            <h1 className={styles.headline}>Secure your account in one final step.</h1>
            <p className={styles.subhead}>
              Set a strong password to activate access to the Agency Control Center and continue with your invite.
            </p>
            <div className={styles.chips}>
              <span className={styles.chip}>Activation Link</span>
              <span className={styles.chip}>Secure Password</span>
              <span className={styles.chip}>Immediate Access</span>
            </div>
          </div>
        </aside>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Activate Account</h2>
          <p className={styles.cardCopy}>Create your new password and continue to login.</p>
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>New password</span>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 chars, uppercase, lowercase, number"
                autoComplete="new-password"
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Confirm password</span>
              <input
                className={styles.input}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {error ? <div className={styles.error}>{error}</div> : null}
            {ok ? <div className={styles.ok}>{ok}</div> : null}
            <button className={styles.submit} type="submit" disabled={busy}>
              {busy ? "Saving..." : "Activate account"}
            </button>
          </form>
          <p className={styles.hint}>
            For security, activation links expire automatically and can only be used once.
          </p>
        </section>
      </section>
    </main>
  );
}

function ActivateFallback() {
  return (
    <main className={styles.page}>
      <section className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Activate Account</h2>
          <p className={styles.cardCopy}>Loading activation form...</p>
        </section>
      </section>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<ActivateFallback />}>
      <ActivatePageInner />
    </Suspense>
  );
}
