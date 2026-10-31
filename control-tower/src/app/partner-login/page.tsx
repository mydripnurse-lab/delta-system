import Link from "next/link";
import Image from "next/image";
import { clinicsEnabled,getClinicIdentity } from "@/lib/clinicAuth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PartnerExperience, PartnerFooter, PartnerHeader } from "@/components/partner/PartnerBrand";
import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";

import styles from "./partnerLogin.module.css";
import { PartnerLoginForm } from "./PartnerLoginForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Partner Portal Login | My Drip Nurse",
  robots: { index: false, follow: false },
};

export default async function PartnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; mode?: string }>;
}) {
  const { returnTo: requestedReturnTo, mode } = await searchParams;
  const returnTo = requestedReturnTo === "/" ? "/" : "";
  const applicationMode = mode === "apply";
  const returnQuery = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";
  const loginHref = `/partner-login?mode=login${returnQuery}`;
  const applicationHref = `/partner-login?mode=apply${returnQuery}`;
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase();
  if (process.env.NODE_ENV === "production" && host !== "partners.mydripnurse.com") {
    redirect("https://partners.mydripnurse.com/partner-login");
  }
  const session = await getPartnerPortalSession();
  if (!session && clinicsEnabled() && await getClinicIdentity()) redirect("/portal/clinics");
  if (session) redirect(returnTo || (process.env.NODE_ENV === "production" ? "https://partners.mydripnurse.com/portal" : "/partner-portal"));
  if (!applicationMode) return (
    <PartnerExperience className={styles.loginExperience}>
      <a href="#sign-in" className={styles.skipLink}>Skip to sign in</a>
      <main className={styles.loginLayout}>
        <aside className={styles.brandPanel} aria-label="My Drip Nurse partner workspace">
          <Link href="/" className={styles.brandLogo} aria-label="My Drip Nurse home">
            <Image src="/mdn-logo.png" alt="My Drip Nurse" width={240} height={51} priority />
          </Link>
          <div className={styles.brandContent}>
            <span className={styles.brandEyebrow}>THE PARTNER WORKSPACE</span>
            <h2>Your practice.<br />Your people.<br /><em>One place.</em></h2>
            <p>A dedicated space for the professionals and clinics bringing personalized care closer to home.</p>
            <div className={styles.brandDetails}><span>Appointments</span><span>Availability</span><span>Your team</span></div>
          </div>
          <div className={styles.brandFooter}><span className={styles.brandMark} aria-hidden="true">✦</span> Connected by care. Powered by My Drip Nurse.</div>
        </aside>
        <section className={styles.loginPanel} aria-labelledby="sign-in-title">
          <header className={styles.loginTopbar}><span>PARTNERS &amp; CLINICS</span><a href="mailto:info@mydripnurse.com?subject=Partner%20Portal%20access">Need help? <span aria-hidden="true">↗</span></a></header>
          <div id="sign-in" className={styles.loginContent} tabIndex={-1}>
            <div className={styles.loginSymbol} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div>
            <h1 id="sign-in-title">Welcome back.</h1>
            <p className={styles.loginIntro}>Your next chapter of care starts here.<br />Sign in to your partner or clinic workspace.</p>
            <PartnerLoginForm returnTo={returnTo} />
            <div className={styles.joinOptions}>
              <p>New to My Drip Nurse?</p>
              <Link href={applicationHref}><span>Join as a professional</span><span aria-hidden="true">↗</span></Link>
              {clinicsEnabled() ? <Link href="/clinics/register"><span>Register your clinic</span><span aria-hidden="true">↗</span></Link> : null}
            </div>
          </div>
          <footer className={styles.loginFooter}><span>My Drip Nurse · Partner network</span><Link href="/">Explore the directory <span aria-hidden="true">↗</span></Link></footer>
        </section>
      </main>
    </PartnerExperience>
  );
  return (
    <PartnerExperience>
      <PartnerHeader />
      <main className={`${styles.main} ${applicationMode ? styles.applicationMain : ""}`.trim()}>
        <div className={styles.authShell}>
          <nav className={styles.authTabs} aria-label="Partner account options">
            <Link href={loginHref} className={!applicationMode ? styles.authTabActive : ""} aria-current={!applicationMode ? "page" : undefined}>
              Sign in
            </Link>
            <Link href={applicationHref} className={applicationMode ? styles.authTabActive : ""} aria-current={applicationMode ? "page" : undefined}>
              Become a Partner
            </Link>
            {clinicsEnabled() ? <Link href="/clinics/register">Register your clinic</Link> : null}
          </nav>

            <section className={styles.applicationCard}>
              <div className={styles.applicationHeading}>
                <span className={styles.eyebrow}>Secure Partner application</span>
                <h1>Join the My Drip Nurse Partner network.</h1>
                <p>Tell us about your professional background, business, and the communities you are prepared to serve. Applications are reviewed before portal access is activated.</p>
              </div>
              <div className={styles.formFrameShell}>
                <div className={styles.formFrameTopbar}>
                  <div><span aria-hidden="true" /> Secure application</div>
                  <p>My Drip Nurse Partner Network</p>
                </div>
                <iframe
                  className={styles.applicationFrame}
                  src="/partner-application.html?embedded=1&v=20260820-partner-login"
                  title="My Drip Nurse Partner application"
                />
              </div>
              <p className={styles.applicationFinePrint}>Submission does not guarantee acceptance, territory availability, appointments, or income. Approved applicants receive activation and onboarding instructions by email.</p>
            </section>
        </div>
      </main>
      <PartnerFooter />
    </PartnerExperience>
  );
}
