"use client";

import { FormEvent, type ReactNode, useEffect, useState } from "react";

import PhoneInputField from "@/components/shared/PhoneInputField";
import styles from "./bookingIdentityPanel.module.css";

type Props = {
  children?: ReactNode;
  connectedName?: string;
  embedded?: boolean;
  returnTo: string;
  serviceName: string;
};

function GoogleMark() {
  return (
    <svg className={styles.googleIcon} aria-hidden="true" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.91-2.258c-.805.54-1.834.86-3.046.86-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.708A5.42 5.42 0 0 1 3.68 9c0-.593.102-1.17.283-1.708V4.96H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.04l3.007-2.332Z" />
      <path fill="#EA4335" d="M9 3.578c1.322 0 2.508.454 3.441 1.346l2.582-2.582C13.464.89 11.427 0 9 0A9 9 0 0 0 .956 4.96l3.007 2.332C4.672 5.163 6.656 3.578 9 3.578Z" />
    </svg>
  );
}

export default function BookingIdentityPanel({ children, connectedName = "", embedded = false, returnTo, serviceName }: Props) {
  const [guest, setGuest] = useState(false);
  const [ready, setReady] = useState(Boolean(connectedName));
  const [emailOpen, setEmailOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setGuest(window.sessionStorage.getItem("mdn:booking-as-guest") === "1");
  }, []);

  useEffect(() => {
    if (!embedded || window.parent === window) return;
    const root = document.documentElement;
    const body = document.body;
    const previousRootBackground = root.style.background;
    const previousBodyBackground = body.style.background;
    root.style.background = "#ebf2f9";
    body.style.background = "#ebf2f9";

    let frame = 0;
    const publishHeight = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const bodyTop = body.getBoundingClientRect().top;
        const contentBottom = Array.from(body.children).reduce((bottom, child) => (
          Math.max(bottom, child.getBoundingClientRect().bottom - bodyTop)
        ), 0);
        const height = Math.max(320, Math.ceil(contentBottom + 16));
        window.parent.postMessage({ type: "mdn-booking-resize", height }, "*");
      });
    };
    const observer = new ResizeObserver(publishHeight);
    observer.observe(body);
    Array.from(body.children).forEach((child) => observer.observe(child));
    window.addEventListener("load", publishHeight);
    publishHeight();
    const delayed = window.setTimeout(publishHeight, 350);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
      window.removeEventListener("load", publishHeight);
      observer.disconnect();
      root.style.background = previousRootBackground;
      body.style.background = previousBodyBackground;
    };
  }, [embedded]);

  if (connectedName) {
    return <>
      <section className={styles.connected} data-mdn-booking-embed={embedded ? "true" : undefined} aria-label="Care account connected">
        <span aria-hidden="true">✓</span>
        <div><small>My Drip Nurse Care connected</small><strong>Welcome back, {connectedName}.</strong><p>Your details are ready. Review today&apos;s screening and appointment address.</p></div>
      </section>
      {children}
    </>;
  }

  if (guest) {
    return <>
      <section className={styles.guest} data-mdn-booking-embed={embedded ? "true" : undefined} aria-label="Guest booking">
        <div><small>Guest booking</small><strong>Continue without an account.</strong><p>We&apos;ll ask only for the details needed for this {serviceName} visit.</p></div>
        <div className={styles.guestActions}>
          {!ready ? <button type="button" className={styles.continueGuest} onClick={() => { setReady(true); window.setTimeout(() => document.getElementById("booking-medical-screening")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>Continue booking</button> : null}
          <button type="button" onClick={() => { window.sessionStorage.removeItem("mdn:booking-as-guest"); setGuest(false); setReady(false); }}>Use an account instead</button>
        </div>
      </section>
      {ready ? children : null}
    </>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/client-auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: data.get("fullName"),
          phone: data.get("phone"),
          email: data.get("email"),
          password: data.get("password"),
          returnTo,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; message?: string; requiresVerification?: boolean; next?: string };
      if (!response.ok) throw new Error(result.error || "We could not complete that request.");
      if (result.requiresVerification) {
        setMessage(result.message || "Check your email to verify your account, then you will return to this booking.");
        return;
      }
      const destination = result.next || returnTo;
      if (embedded && window.parent !== window) {
        window.parent.postMessage({ type: "mdn-booking-auth-return", url: destination }, "*");
        window.setTimeout(() => {
          if (window.top && window.top !== window) window.top.location.assign(destination);
        }, 50);
      } else window.location.assign(destination);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not complete that request.");
    } finally {
      setBusy(false);
    }
  }

  const googleUrl = `https://care.mydripnurse.com/api/client-auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
  return <section className={styles.panel} data-mdn-booking-embed={embedded ? "true" : undefined} aria-label="Choose how to book">
    <div className={styles.heading}><small>Start here</small><strong>Continue your booking.</strong><p>Sign in to use your saved details, or continue as a guest. Your selected service stays right here.</p></div>
    <div className={styles.actions}>
      <a className={styles.google} href={googleUrl} target="_top"><GoogleMark />Sign in with Google</a>
      <button type="button" className={styles.email} aria-expanded={emailOpen} onClick={() => setEmailOpen((value) => !value)}>Continue with email</button>
      <button type="button" className={styles.guestButton} onClick={() => { window.sessionStorage.setItem("mdn:booking-as-guest", "1"); setGuest(true); setReady(true); window.setTimeout(() => document.getElementById("booking-medical-screening")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>Continue as guest</button>
    </div>
    {emailOpen ? <div className={styles.emailPanel}>
      <div className={styles.modeSwitch} role="group" aria-label="Email account option">
        <button type="button" className={mode === "login" ? styles.activeMode : ""} onClick={() => { setMode("login"); setMessage(""); }}>Sign in</button>
        <button type="button" className={mode === "register" ? styles.activeMode : ""} onClick={() => { setMode("register"); setMessage(""); }}>Create account</button>
      </div>
      <form onSubmit={submit}>
        {mode === "register" ? <><label>Full name<input name="fullName" required autoComplete="name" /></label><PhoneInputField name="phone" label={<>Mobile number <small>Optional</small></>} /></> : null}
        <label>Email<input name="email" required type="email" autoComplete="email" /></label>
        <label>Password<input name="password" required type="password" minLength={10} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {message ? <p role="status">{message}</p> : null}
        <button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in and continue" : "Create account and continue"}</button>
      </form>
    </div> : null}
  </section>;
}
