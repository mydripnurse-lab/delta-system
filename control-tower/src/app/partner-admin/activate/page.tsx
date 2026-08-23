"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import styles from "../../activate/activate.module.css";

const BRAND_ICON_URL = "https://storage.googleapis.com/msgsndr/K8GcSVZWinRaQTMF6Sb8/media/698c5030a41b87368f94ef80.png";

function ActivationForm() {
  const search = useSearchParams();
  const router = useRouter();
  const token = useMemo(() => String(search.get("token") || "").trim(), [search]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return setError("This activation link is incomplete.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Activation failed.");
      setSuccess("Your Market Manager account is ready. Redirecting to sign in…");
      window.setTimeout(() => router.push("/partner-admin/login"), 1000);
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.grid}>
        <aside className={styles.hero}><div><div className={styles.brand}><img src={BRAND_ICON_URL} alt="My Drip Nurse" /><p className={styles.brandTitle}>My Drip Nurse</p></div><h1 className={styles.headline}>Your markets, clearly connected.</h1><p className={styles.subhead}>Activate secure access to the states you manage, their operations and your earned commission.</p><div className={styles.chips}><span className={styles.chip}>State access</span><span className={styles.chip}>Secure account</span><span className={styles.chip}>Market reporting</span></div></div></aside>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Activate Market Manager account</h2>
          <p className={styles.cardCopy}>Create a secure password to access your assigned markets.</p>
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}><span className={styles.fieldLabel}>New password</span><input className={styles.input} type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label>
            <label className={styles.field}><span className={styles.fieldLabel}>Confirm password</span><input className={styles.input} type="password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label>
            {error ? <div className={styles.error}>{error}</div> : null}
            {success ? <div className={styles.ok}>{success}</div> : null}
            <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Activating…" : "Activate account"}</button>
          </form>
          <p className={styles.hint}>Activation links are private, expire automatically and can be used only once.</p>
        </section>
      </section>
    </main>
  );
}

export default function StateMarketManagerActivatePage() {
  return <Suspense fallback={<main className={styles.page} />}><ActivationForm /></Suspense>;
}
