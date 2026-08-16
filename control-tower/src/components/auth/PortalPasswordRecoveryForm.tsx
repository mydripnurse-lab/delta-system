"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./portalPasswordRecovery.module.css";

type PortalPasswordRecoveryFormProps = {
  mode: "forgot" | "reset";
  endpoint: string;
  loginHref: string;
  portalName: string;
};

export function PortalPasswordRecoveryForm({
  mode,
  endpoint,
  loginHref,
  portalName,
}: PortalPasswordRecoveryFormProps) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("confirmation") || "");

    if (mode === "reset" && password !== confirmation) {
      setError("The passwords do not match.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "forgot" ? { email } : { token, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        next?: string;
      };

      if (!response.ok) throw new Error(payload.error || "We could not complete this request.");

      if (mode === "forgot") {
        setSuccess(payload.message || "If an eligible account exists, a secure link is on its way.");
      } else {
        setSuccess(payload.message || "Your password has been updated securely.");
        window.setTimeout(() => window.location.assign(payload.next || loginHref), 900);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not complete this request.");
    } finally {
      setBusy(false);
    }
  }

  const isReset = mode === "reset";

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="password-recovery-title">
        <div className={styles.brandPanel}>
          <Image src="/mdn-logo.png" alt="My Drip Nurse" width={210} height={48} priority />
          <div>
            <p className={styles.eyebrow}>Secure account access</p>
            <p className={styles.portalName}>{portalName}</p>
          </div>
          <p className={styles.brandNote}>Private, single-use recovery managed by My Drip Nurse.</p>
        </div>

        <div className={styles.formPanel}>
          <div className={styles.securityMark} aria-hidden="true">✓</div>
          <p className={styles.eyebrow}>{isReset ? "Final step" : "Password help"}</p>
          <h1 id="password-recovery-title">
            {isReset ? "Choose a new password." : "Let’s get you back in."}
          </h1>
          <p className={styles.intro}>
            {isReset
              ? "Create a strong password for your account. Every previous session will be signed out for your protection."
              : "Enter the email associated with your account and we’ll send a secure, one-time recovery link."}
          </p>

          {isReset && !token ? (
            <div className={styles.feedback} role="alert">
              This recovery link is incomplete. Request a new password reset email to continue.
            </div>
          ) : (
            <form className={styles.form} onSubmit={submit}>
              {isReset ? (
                <>
                  <label>
                    <span>New password</span>
                    <input name="password" type="password" autoComplete="new-password" minLength={10} required />
                  </label>
                  <label>
                    <span>Confirm new password</span>
                    <input name="confirmation" type="password" autoComplete="new-password" minLength={10} required />
                  </label>
                  <p className={styles.hint}>Use at least 10 characters with uppercase, lowercase and a number.</p>
                </>
              ) : (
                <label>
                  <span>Email address</span>
                  <input name="email" type="email" autoComplete="email" inputMode="email" required />
                </label>
              )}

              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              {success ? <p className={styles.success} role="status">{success}</p> : null}

              <button type="submit" disabled={busy || Boolean(success)}>
                <span>{busy ? "Please wait…" : isReset ? "Save new password" : "Send secure link"}</span>
                <b aria-hidden="true">→</b>
              </button>
            </form>
          )}

          <Link className={styles.backLink} href={loginHref}>← Back to sign in</Link>
          <p className={styles.channelNote}>Recovery links expire after one hour and can be used only once.</p>
        </div>
      </section>
    </main>
  );
}
