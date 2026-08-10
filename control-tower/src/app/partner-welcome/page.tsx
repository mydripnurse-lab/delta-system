"use client";

import Image from "next/image";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  PartnerExperience,
  PartnerFooter,
  PartnerHeader,
} from "@/components/partner/PartnerBrand";
import styles from "./partnerWelcome.module.css";

type OnboardingData = {
  partnerUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  countyStateNames: string;
  loginUrl: string;
  expiresAt: string;
  publicTitle?: string;
  professionalCredentials?: string;
  biography?: string;
  profilePhotoUrl?: string;
  partnerSlug?: string;
  partnerWebsiteUrl?: string;
};

export default function PartnerWelcomePage() {
  return (
    <Suspense fallback={<WelcomeLoadingState />}>
      <PartnerWelcomeContent />
    </Suspense>
  );
}

function WelcomeLoadingState() {
  return (
    <PartnerExperience>
      <main className={styles.page}>
        <section className={styles.stateCard}>
          <div className={styles.stateMark} aria-hidden="true">MDN</div>
          <div className={styles.spinner} aria-label="Loading" />
          <h1>Preparing your welcome page</h1>
          <p>We are securely loading your Partner information.</p>
        </section>
      </main>
    </PartnerExperience>
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
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState("");

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

  async function openPartnerPortal() {
    setPortalBusy(true);
    setPortalError("");
    try {
      const response = await fetch("/api/public/partner-portal/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingToken: token }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to activate your Partner Portal.");
      window.location.href = payload.redirectTo;
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Unable to activate your Partner Portal.");
      setPortalBusy(false);
    }
  }

  if (status !== "ready" || !data) {
    return (
      <PartnerExperience>
        <main className={styles.page}>
          <section className={styles.stateCard}>
            <div className={styles.stateMark} aria-hidden="true">MDN</div>
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
      </PartnerExperience>
    );
  }

  return (
    <PartnerExperience>
      <main className={styles.page}>
      <PartnerHeader />

      <section className={styles.hero}>
        <div className={styles.shell}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Partner onboarding · Access ready</span>
            <h1>Welcome to the <em>My Drip Nurse</em> network.</h1>
            <p>
              Hi <strong>{data.firstName}</strong>. Your Partner access is ready for <strong>{data.countyStateNames}</strong>.
              Everything you need to get started is available below.
            </p>
            <a href="#account-setup" className={styles.primaryButton}>
              Start your onboarding <span aria-hidden="true">→</span>
            </a>
          </div>
          <aside className={styles.heroCard} aria-label="Onboarding overview">
            <span className={styles.heroCardLabel}>Your Partner launch</span>
            <div className={styles.launchStep}>
              <span>01</span>
              <div><strong>Activate your account</strong><small>Secure your access to the platform.</small></div>
            </div>
            <div className={styles.launchStep}>
              <span>02</span>
              <div><strong>Review your service area</strong><small>{data.countyStateNames}</small></div>
            </div>
            <div className={styles.launchStep}>
              <span>03</span>
              <div><strong>Prepare to receive appointments</strong><small>Confirm calendars and notifications.</small></div>
            </div>
          </aside>
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

      <section className={styles.accountSection} id="account-setup">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>Account setup</span>
            <h2>Activate, sign in, and go mobile.</h2>
          </div>
          <div className={styles.grid}>
            <article className={`${styles.card} ${styles.blueCard}`}>
              <span className={styles.step}>1</span>
              <h3>Your account details</h3>
              <p>Use these secure credentials to sign in to your My Drip Nurse Partner Portal.</p>
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
              <a href={data.loginUrl || "https://partners.mydripnurse.com/login"} className={styles.button}>Open Partner Portal</a>
            </article>

            <article className={styles.card}>
              <span className={styles.step}>2</span>
              <div className={styles.portalMark} aria-hidden="true">MDN</div>
              <h3>Install your Partner Portal</h3>
              <p>Open the portal on your phone and add it to your home screen for quick access to appointments, services, and support.</p>
              <a href={data.loginUrl || "https://partners.mydripnurse.com/login"} className={styles.button}>Open portal instructions</a>
            </article>
          </div>
        </div>
      </section>

      {data.profilePhotoUrl || data.biography ? (
        <section className={styles.profileSection}>
          <div className={styles.shell}>
            <div className={styles.profilePreview}>
              {data.profilePhotoUrl ? (
                <Image
                  src={data.profilePhotoUrl}
                  alt={`${data.firstName} ${data.lastName}`.trim()}
                  title={`${data.firstName} ${data.lastName} My Drip Nurse Partner profile`.trim()}
                  width={420}
                  height={520}
                  className={styles.profilePhoto}
                />
              ) : null}
              <div className={styles.profileCopy}>
                <span className={styles.eyebrow}>Your Partner website profile</span>
                <h2>{data.firstName} {data.lastName}</h2>
                {data.publicTitle ? <strong>{data.publicTitle}</strong> : null}
                {data.professionalCredentials ? <small>{data.professionalCredentials}</small> : null}
                {data.biography ? <p>{data.biography}</p> : null}
                {data.partnerWebsiteUrl ? (
                  <div className={styles.websiteReservation}>
                    <small>Your reserved website</small>
                    <strong>{data.partnerWebsiteUrl.replace(/^https?:\/\//, "")}</strong>
                  </div>
                ) : null}
                <span className={styles.profileStatus}>Profile received · Website preparation pending</span>
                <button type="button" className={styles.portalButton} onClick={openPartnerPortal} disabled={portalBusy}>
                  {portalBusy ? "Opening your portal…" : "Open Partner Portal"} <span aria-hidden="true">→</span>
                </button>
                {portalError ? <p className={styles.portalError}>{portalError}</p> : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.checkSection}>
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>Before you finish</span>
            <h2>Three quick checks.</h2>
          </div>
          <div className={styles.checkGrid}>
            <article><span className={styles.step}>1</span><h3>Sign in</h3><p>Confirm you can access your My Drip Nurse Partner Portal.</p></article>
            <article><span className={styles.step}>2</span><h3>Allow notifications</h3><p>Enable notifications for messages, appointments, and updates.</p></article>
            <article><span className={styles.step}>3</span><h3>Review your access</h3><p>Confirm your conversations, calendars, and appointments are visible.</p></article>
          </div>
        </div>
      </section>

      <PartnerFooter />
      </main>
    </PartnerExperience>
  );
}
