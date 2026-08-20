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
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo: requestedReturnTo } = await searchParams;
  const returnTo = requestedReturnTo === "/" ? "/" : "";
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase();
  if (process.env.NODE_ENV === "production" && host !== "partners.mydripnurse.com") {
    redirect("https://partners.mydripnurse.com/partner-login");
  }
  const session = await getPartnerPortalSession();
  if (session) redirect(returnTo || (process.env.NODE_ENV === "production" ? "https://partners.mydripnurse.com/portal" : "/partner-portal"));
  return (
    <PartnerExperience>
      <PartnerHeader />
      <main className={styles.main}>
        <section className={styles.card}>
          <span className={styles.eyebrow}>My Drip Nurse Partner Portal</span>
          <h1>Welcome back.</h1>
          <p>Use the same email and password included for your LeadConnector account. One credential now opens both systems.</p>
          <PartnerLoginForm returnTo={returnTo} />
          <div className={styles.notice}><strong>First time signing in?</strong><span>Your welcome email also includes a secure activation button and your Partner website URL.</span></div>
          <a href="mailto:info@mydripnurse.com?subject=Partner%20Portal%20access" className={styles.secondary}>Request access help</a>
          <Link href="/" className={styles.secondary}>Meet our Partners</Link>
        </section>
      </main>
      <PartnerFooter />
    </PartnerExperience>
  );
}
