import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PartnerExperience, PartnerFooter, PartnerHeader } from "@/components/partner/PartnerBrand";
import { getPartnerProfileForPublicPage } from "@/lib/partnerProfiles";
import { buildPartnerMetadata } from "@/lib/partnerSeo";

import styles from "./affiliateLanding.module.css";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPartnerProfileForPublicPage(slug);
  if (!profile) return { title: "Become a My Drip Nurse Partner" };
  return buildPartnerMetadata({
    profile,
    pathname: "become-a-partner",
    title: `Become a My Drip Nurse Partner | Invited by ${profile.displayName}`,
    description: `Build your independent healthcare business with the My Drip Nurse Partner network, invited by ${profile.displayName}.`,
  });
}

export default async function AffiliateLandingPage({ params }: Props) {
  const { slug } = await params;
  const profile = await getPartnerProfileForPublicPage(slug);
  if (!profile) notFound();
  const applicationBase = process.env.PARTNER_APPLICATION_URL || "https://orange-county.mydripnurse.com/become-a-partner";
  const applicationUrl = `${applicationBase}${applicationBase.includes("?") ? "&" : "?"}ref=${encodeURIComponent(profile.affiliateCode)}`;

  return (
    <PartnerExperience>
      <PartnerHeader
        navItems={[
          { href: `/${profile.slug}`, label: "Home" },
          { href: `/${profile.slug}/services`, label: "Services" },
          { href: `/${profile.slug}/become-a-partner`, label: "Partner With Us" },
        ]}
        action={{ href: applicationUrl, label: "Apply now" }}
      />
      <main>
        <section className={styles.hero}>
          <div className={styles.shell}>
            <div>
              <span className={styles.eyebrow}>Grow with My Drip Nurse</span>
              <h1>Build a healthcare business that is <em>yours</em>.</h1>
              <p>{profile.displayName} invites you to explore the My Drip Nurse Partner network—built for qualified healthcare professionals ready to serve their community.</p>
              <a href={applicationUrl} className={styles.primary}>Start your application <span>→</span></a>
            </div>
            <aside className={styles.referralCard}>
              <span>Invited by</span>
              <strong>{profile.displayName}</strong>
              <small>{profile.publicTitle || "My Drip Nurse Partner"}</small>
              <p>Your secure application will carry this Partner referral automatically.</p>
            </aside>
          </div>
        </section>
        <section className={styles.benefits}>
          <div className={styles.shell}>
            <div><span>01</span><h2>Trusted brand</h2><p>Operate with the systems, services, and patient experience of My Drip Nurse.</p></div>
            <div><span>02</span><h2>Local opportunity</h2><p>Request the counties where you want to provide personalized mobile IV care.</p></div>
            <div><span>03</span><h2>Operational support</h2><p>Receive onboarding, calendar access, and a branded Partner website.</p></div>
          </div>
        </section>
        <section className={styles.cta}>
          <span className={styles.eyebrow}>Ready when you are</span>
          <h2>Take the first step.</h2>
          <p>Tell us about your experience, professional background, and desired service area.</p>
          <a href={applicationUrl} className={styles.primary}>Apply to become a Partner <span>→</span></a>
          <Link href={`/${profile.slug}`}>Return to {profile.displayName}&apos;s website</Link>
        </section>
      </main>
      <PartnerFooter />
    </PartnerExperience>
  );
}
