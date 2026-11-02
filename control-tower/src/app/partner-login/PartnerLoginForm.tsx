"use client";

import { FormEvent, useRef, useState } from "react";

import styles from "./partnerLogin.module.css";

export function PartnerLoginForm({ returnTo = "", clinicsAvailable = false, initialRole = "nurse", clinicSlug }: { returnTo?: string; clinicsAvailable?: boolean; initialRole?: "nurse" | "clinic"; clinicSlug?: string }) {
  const [role, setRole] = useState<"nurse" | "clinic">(clinicsAvailable ? initialRole : "nurse");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/public/partner-portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password"), returnTo, ...(clinicSlug ? { clinicSlug } : { role }) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to sign in.");
      window.location.assign(payload.redirectTo || "/portal");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={busy}>
      {clinicsAvailable && !clinicSlug ? (
        <fieldset className={styles.roleSelector} disabled={busy}>
          <legend>Choose your workspace</legend>
          <div className={styles.roleOptions}>
            {(["nurse", "clinic"] as const).map(option => (
              <label key={option}>
                <input type="radio" name="workspace" value={option} checked={role === option} onChange={() => { setRole(option); setError(""); }} />
                <span>Login as {option === "nurse" ? "Nurse" : "Clinic"}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className={styles.field}>
        <label htmlFor="partner-email">Email address</label>
        <input id="partner-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" required readOnly={busy} />
      </div>
      <div className={styles.field}>
        <div className={styles.fieldHeading}><label htmlFor="partner-password">Password</label><a className={styles.forgot} href={clinicSlug ? "https://partners.mydripnurse.com/forgot-password" : "/forgot-password"}>Forgot password?</a></div>
        <div className={styles.passwordField}>
          <input id="partner-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required readOnly={busy} />
          <button className={styles.passwordToggle} type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="partner-password" onClick={() => setShowPassword(value => !value)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{showPassword ? <path d="m3 3 18 18"/> : null}</svg>
          </button>
        </div>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button className={styles.primary} disabled={busy} type="submit"><span>{busy ? "Signing in…" : clinicSlug ? "Sign in to your workspace" : role === "clinic" ? "Sign in as Clinic" : "Sign in as Nurse"}</span>{busy ? <span className={styles.spinner} aria-hidden="true"/> : <span aria-hidden="true">→</span>}</button>
    </form>
  );
}
