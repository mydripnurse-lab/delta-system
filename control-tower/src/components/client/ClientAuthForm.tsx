"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import styles from "@/app/client-login/clientLogin.module.css";
import PhoneInputField from "@/components/shared/PhoneInputField";
import { safeClientReturnUrl } from "@/lib/clientAuthDestination";

type ClientAuthFormProps = {
  mode: "login" | "register";
};

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://care.mydripnurse.com");
    const pathname = parsed.pathname.replace(/\/$/, "") || "/";
    if (!["/", "/book", "/services", "/appointments", "/referrals", "/rewards", "/rewards/invitations", "/rewards/nad", "/rewards/visits", "/products", "/profile", "/refund-request"].includes(pathname) && !/^\/book\/[a-z0-9-]+$/i.test(pathname)) return "/";
    const partnerId = parsed.searchParams.get("partner") || "";
    const validPartnerId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(partnerId) ? partnerId : "";
    if (pathname === "/book") {
      const service = parsed.searchParams.get("service") || "";
      const preserved = new URLSearchParams();
      if (/^[a-z0-9-]+$/i.test(service)) preserved.set("service", service);
      if (validPartnerId) preserved.set("partner", validPartnerId);
      return preserved.size ? `${pathname}?${preserved.toString()}` : pathname;
    }
    return pathname.startsWith("/book/") && validPartnerId
      ? `${pathname}?partner=${encodeURIComponent(validPartnerId)}`
      : pathname;
  } catch {
    return "/";
  }
}

export default function ClientAuthForm({ mode }: ClientAuthFormProps) {
  const params = useSearchParams();
  const next = useMemo(() => safeNext(params.get("next")), [params]);
  const returnTo = useMemo(() => safeClientReturnUrl(params.get("returnTo")), [params]);
  const googleError = params.get("error");
  const invitedEmail = params.get("email") || "";
  const referral = useMemo(() => {
    const value = params.get("referral") || "";
    return /^[A-Za-z0-9_-]{20,80}$/.test(value) ? value : "";
  }, [params]);
  const [message, setMessage] = useState(googleError ? "Google sign-in could not be completed. Please try again." : "");
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSuccess(false);
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    const payload = {
      fullName: data.get("fullName"),
      email: data.get("email"),
      phone: data.get("phone"),
      password: data.get("password"),
      next,
      returnTo,
      referral,
    };
    try {
      const response = await fetch(`/api/client-auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        message?: string;
        requiresVerification?: boolean;
        next?: string;
      };
      if (!response.ok && !result.ok) throw new Error(result.error || "We could not complete that request.");
      if (result.requiresVerification) {
        setIsSuccess(true);
        setMessage(result.message || "Check your email to verify your account.");
        return;
      }
      window.location.assign(result.next || next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not complete that request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.formPanel}>
      <div className={styles.formIntro}>
        <span>{mode === "login" ? "Welcome back" : "Your care starts here"}</span>
        <h1>{mode === "login" ? "Sign in to your care." : "Create your care account."}</h1>
        <p>
          {mode === "login"
            ? "Appointments, care details and your trusted care team—securely in one place."
            : "Use the same email you use when booking to connect your appointments automatically."}
        </p>
      </div>

      {referral && mode === "register" ? (
        <p className={styles.successMessage} role="status">You were personally invited to My Drip Nurse Care. Create your account to count toward your friend&apos;s referral progress.</p>
      ) : null}

      <a className={styles.googleButton} href={`/api/client-auth/google/start?next=${encodeURIComponent(next)}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}${referral ? `&referral=${encodeURIComponent(referral)}` : ""}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
          <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.37l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
          <path fill="#FBBC05" d="M6.39 13.92A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z" />
          <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z" />
        </svg>
        Continue with Google
      </a>

      <div className={styles.divider}><span>or continue with email</span></div>

      <form onSubmit={submit} className={styles.form}>
        {mode === "register" ? (
          <div className={styles.twoColumns}>
            <label>
              Full name
              <input name="fullName" autoComplete="name" required placeholder="Your full name" />
            </label>
            <PhoneInputField
              name="phone"
              label={<>Mobile number <small>{referral ? "Required for this invitation" : "Optional"}</small></>}
              hint="Select your country or begin with + to detect it automatically."
              required={Boolean(referral)}
            />
          </div>
        ) : null}
        <label>
          Email address
          <input name="email" type="email" autoComplete="email" required placeholder="you@example.com" defaultValue={invitedEmail} />
        </label>
        <label>
          <span className={styles.labelRow}>Password {mode === "login" ? <Link href="/forgot-password">Forgot password?</Link> : null}</span>
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={10}
            required
            placeholder={mode === "login" ? "Your password" : "10+ characters"}
          />
        </label>
        {message ? (
          <p className={isSuccess ? styles.successMessage : styles.errorMessage} role="status">{message}</p>
        ) : null}
        <button className={styles.submitButton} type="submit" disabled={submitting || isSuccess}>
          <span>{submitting ? "Please wait…" : mode === "login" ? "Sign in securely" : "Create my account"}</span>
          <b aria-hidden="true">→</b>
        </button>
      </form>

      <p className={styles.switchMode}>
        {mode === "login" ? "New to My Drip Nurse?" : "Already have an account?"}{" "}
        <Link href={`${mode === "login" ? "/register" : "/login"}?${new URLSearchParams({ ...(next !== "/" ? { next } : {}), ...(returnTo ? { returnTo } : {}), ...(referral ? { referral } : {}) }).toString()}`}>
          {mode === "login" ? "Create account" : "Sign in"}
        </Link>
      </p>
      <p className={styles.privacyNote}>Your personal information is encrypted in transit and never sold.</p>
    </div>
  );
}
