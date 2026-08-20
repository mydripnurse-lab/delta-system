import Link from "next/link";
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
  if (session) redirect(returnTo || (process.env.NODE_ENV === "production" ? "https://partners.mydripnurse.com/portal" : "/partner-portal"));
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
          </nav>

          {applicationMode ? (
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
          ) : (
            <section className={styles.card}>
              <span className={styles.eyebrow}>My Drip Nurse Partner Portal</span>
              <h1>Welcome back.</h1>
              <p>Use the same email and password included for your LeadConnector account. One credential now opens both systems.</p>
              <PartnerLoginForm returnTo={returnTo} />
              <div className={styles.notice}>
                <strong>Not a Partner yet?</strong>
                <span>Complete the application to be considered for the My Drip Nurse Partner network.</span>
                <Link href={applicationHref} className={styles.noticeLink}>Start your application <span aria-hidden="true">→</span></Link>
              </div>
              <a href="mailto:info@mydripnurse.com?subject=Partner%20Portal%20access" className={styles.secondary}>Request access help</a>
              <Link href="/" className={styles.secondary}>Meet our Partners</Link>
            </section>
          )}
        </div>
      </main>
      <PartnerFooter />
    </PartnerExperience>
  );
}
