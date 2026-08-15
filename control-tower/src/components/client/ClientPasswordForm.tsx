"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import styles from "@/app/client-login/clientLogin.module.css";

export default function ClientPasswordForm({ mode, token: tokenProp = "" }: { mode: "forgot" | "reset"; token?: string }) {
  const params = useSearchParams();
  const resetToken = tokenProp || params.get("token") || "";
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    setWorking(true);
    const form = new FormData(event.currentTarget);
    const payload = mode === "forgot"
      ? { email: form.get("email") }
      : { token: resetToken, password: form.get("password") };
    try {
      const response = await fetch(`/api/client-auth/${mode === "forgot" ? "forgot-password" : "reset-password"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; message?: string; next?: string };
      if (!response.ok) throw new Error(result.error || "We could not complete that request.");
      if (mode === "reset") {
        window.location.assign(result.next || "/");
        return;
      }
      setSuccess(true);
      setMessage(result.message || "Check your email for a secure reset link.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not complete that request.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.formPanel}>
      <div className={styles.formIntro}>
        <span>Secure patient access</span>
        <h1>{mode === "forgot" ? "Let’s get you back in." : "Choose a new password."}</h1>
        <p>{mode === "forgot" ? "Enter your verified email and we’ll send a secure reset link." : "Use at least 10 characters with uppercase, lowercase and a number."}</p>
      </div>
      <form onSubmit={submit} className={`${styles.form} ${styles.passwordForm}`}>
        {mode === "forgot" ? (
          <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
        ) : (
          <label>New password<input name="password" type="password" autoComplete="new-password" required minLength={10} placeholder="10+ characters" /></label>
        )}
        {message ? <p className={success ? styles.successMessage : styles.errorMessage} role="status">{message}</p> : null}
        <button type="submit" disabled={working || success}><span>{working ? "Please wait…" : mode === "forgot" ? "Send secure link" : "Save new password"}</span><b aria-hidden="true">→</b></button>
      </form>
      <p className={styles.switchMode}><a href="/login">← Return to sign in</a></p>
    </div>
  );
}
