"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PartnerExperience, PartnerFooter, PartnerHeader } from "@/components/partner/PartnerBrand";

import styles from "../partner-login/partnerLogin.module.css";

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function PartnerActivateForm() {
  const searchParams = useSearchParams();
  const token = useMemo(() => normalize(searchParams.get("token")), [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This activation link is missing its secure token.");
      return;
    }
    if (normalize(password) !== normalize(confirmation)) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/public/partner-portal/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to activate your account.");
      window.location.assign(payload.redirectTo || "/portal?onboarding=required");
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Unable to activate your account.");
      setBusy(false);
    }
  }

  return (
    <PartnerExperience>
      <PartnerHeader />
      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="partner-activation-title">
          <span className={styles.eyebrow}>Secure Partner activation</span>
          <h1 id="partner-activation-title">Create your portal password.</h1>
          <p>One final step, then we will sign you in and show you exactly how the Partner Portal works.</p>
          <form className={styles.form} onSubmit={submit}>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={10}
                aria-describedby="partner-password-help"
                required
              />
            </label>
            <small id="partner-password-help">Use at least 10 characters with uppercase, lowercase, and a number.</small>
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                minLength={10}
                required
              />
            </label>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <button className={styles.primary} type="submit" disabled={busy}>
              {busy ? "Activating…" : "Activate and start the tour"}
            </button>
          </form>
          <div className={styles.notice}>
            <strong>Your link works once.</strong>
            <span>After activation, use your email and this new password at partners.mydripnurse.com/login.</span>
          </div>
        </section>
      </main>
      <PartnerFooter />
    </PartnerExperience>
  );
}

function ActivationLoading() {
  return <main className={styles.main}><p>Preparing secure activation…</p></main>;
}

export default function PartnerActivatePage() {
  return <Suspense fallback={<ActivationLoading />}><PartnerActivateForm /></Suspense>;
}
