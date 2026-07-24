"use client";
/* eslint-disable @next/next/no-img-element */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./partnerWelcome.module.css";

type OnboardingData = {
  ghlUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  countyStateNames: string;
  loginUrl: string;
  expiresAt: string;
};

const MDN_LOGO =
  "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/675a44c0da8c3978ab418ac1.png";
const LC_LOGO =
  "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/6a625ae3f9c6f6a920a4d68f.png";

export default function PartnerWelcomePage() {
  return (
    <Suspense fallback={<WelcomeLoadingState />}>
      <PartnerWelcomeContent />
    </Suspense>
  );
}

function WelcomeLoadingState() {
  return (
    <main className={styles.page}>
      <section className={styles.stateCard}>
        <img src={MDN_LOGO} alt="My Drip Nurse" className={styles.logo} />
        <div className={styles.spinner} aria-label="Loading" />
        <h1>Preparing your welcome page</h1>
        <p>We are securely loading your Partner information.</p>
      </section>
    </main>
  );
}

function PartnerWelcomeContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [data, setData] = useState<OnboardingData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "error">(
    token ? "loading" : "invalid",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    const controller = new AbortController();
    fetch(`/api/public/partner-onboarding?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) {
          setStatus(response.status === 404 || response.status === 400 ? "invalid" : "error");
          return;
        }
        setData(payload.onboarding as OnboardingData);
        setStatus("ready");
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, [token]);

  async function copyPassword() {
    if (!data?.password) return;
    await navigator.clipboard.writeText(data.password);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (status !== "ready" || !data) {
    return (
      <main className={styles.page}>
        <section className={styles.stateCard}>
          <img src={MDN_LOGO} alt="My Drip Nurse" className={styles.logo} />
          {status === "loading" ? <div className={styles.spinner} aria-label="Loading" /> : null}
          <h1>{status === "loading" ? "Preparing your welcome page" : "This welcome link is unavailable"}</h1>
          <p>
            {status === "loading"
              ? "We are securely loading your Partner information."
              : "The link may be invalid or expired. Please request a new invitation from the My Drip Nurse support team."}
          </p>
          {status !== "loading" ? (
            <a href="mailto:info@mydripnurse.com">info@mydripnurse.com</a>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.shell}>
          <img src={MDN_LOGO} alt="My Drip Nurse" className={styles.logo} />
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.shell}>
          <span className={styles.eyebrow}>Partner onboarding</span>
          <h1>Welcome to the <em>My Drip Nurse</em> network.</h1>
          <p>
            Hi <strong>{data.firstName}</strong>. Your Partner access is ready for <strong>{data.countyStateNames}</strong>.
            Everything you need to get started is available below.
          </p>
        </div>
      </section>

      <section className={styles.videoSection}>
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>Start here</span>
            <h2>Watch your welcome video.</h2>
            <p>A guided introduction to the My Drip Nurse Partner experience and your next steps.</p>
          </div>
          <div className={styles.videoPlaceholder}>
            <div className={styles.playIcon}>▶</div>
            <strong>Welcome video</strong>
            <span>Your video will appear here once its embed URL is connected.</span>
          </div>
        </div>
      </section>

      <section className={styles.accountSection}>
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>Account setup</span>
            <h2>Activate, sign in, and go mobile.</h2>
          </div>
          <div className={styles.grid}>
            <article className={`${styles.card} ${styles.blueCard}`}>
              <span className={styles.step}>1</span>
              <h3>Your account details</h3>
              <p>Complete the activation sent to your email, then use these credentials to sign in.</p>
              <dl className={styles.details}>
                <div><dt>Account email</dt><dd>{data.email}</dd></div>
                <div><dt>Partner service area</dt><dd>{data.countyStateNames}</dd></div>
                <div>
                  <dt>Temporary password</dt>
                  <dd className={styles.passwordRow}>
                    <code>{showPassword ? data.password : "••••••••••••"}</code>
                    <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button>
                    <button type="button" onClick={copyPassword}>{copied ? "Copied" : "Copy"}</button>
                  </dd>
                </div>
              </dl>
              <a href={data.loginUrl || "https://app.devasks.com"} className={styles.button}>Open Your Account</a>
            </article>

            <article className={styles.card}>
              <span className={styles.step}>2</span>
              <img src={LC_LOGO} alt="LeadConnector" className={styles.lcLogo} />
              <h3>Download the mobile app</h3>
              <p>Manage assigned contacts, conversations, appointments, and calendar updates from your phone.</p>
              <div className={styles.appButtons}>
                <a href="https://apps.apple.com/us/app/lead-connector/id1564302502" target="_blank" rel="noopener noreferrer" className={styles.button}>Download for iPhone</a>
                <a href="https://play.google.com/store/apps/details?id=com.LeadConnector" target="_blank" rel="noopener noreferrer" className={styles.button}>Download for Android</a>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.checkSection}>
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>Before you finish</span>
            <h2>Three quick checks.</h2>
          </div>
          <div className={styles.checkGrid}>
            <article><span className={styles.step}>1</span><h3>Sign in</h3><p>Confirm you can access your account using LeadConnector.</p></article>
            <article><span className={styles.step}>2</span><h3>Allow notifications</h3><p>Enable notifications for messages, appointments, and updates.</p></article>
            <article><span className={styles.step}>3</span><h3>Review your access</h3><p>Confirm your conversations, calendars, and appointments are visible.</p></article>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.shell}>
          <h2>Welcome aboard.</h2>
          <p>
            We are glad to have you in the My Drip Nurse Partner network.<br />
            Need assistance? <a href="mailto:info@mydripnurse.com">Email info@mydripnurse.com</a>.
          </p>
        </div>
      </footer>
    </main>
  );
}
