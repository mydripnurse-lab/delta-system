import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PartnerExperience, PartnerFooter } from "@/components/partner/PartnerBrand";
import PartnerPublicHeader from "@/components/partner/PartnerPublicHeader";
import { getPartnerProfileForPublicPage } from "@/lib/partnerProfiles";

import styles from "../become-a-partner/affiliateLanding.module.css";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partner Application | My Drip Nurse",
  description: "Submit your secure My Drip Nurse Partner application.",
  robots: { index: false, follow: false },
};

export default async function PartnerApplicationPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview = "" } = await searchParams;
  const profile = await getPartnerProfileForPublicPage(slug, preview);
  if (!profile) notFound();
  const previewQuery = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const partnerHref = (pathname = "") => `/${profile.slug}${pathname}${previewQuery}`;
  const embeddedApplicationUrl = `/partner-application.html?embedded=1&v=20260812-primary-county-fix&ref=${encodeURIComponent(profile.affiliateCode)}`;

  return (
    <PartnerExperience>
      <PartnerPublicHeader profile={profile} />
      <main>
        {preview ? (
          <div role="status" style={{ background: "#073f4b", color: "white", padding: "10px 20px", textAlign: "center", fontWeight: 700 }}>
            Private website preview · Application submissions are enabled for testing
          </div>
        ) : null}
        <section className={styles.applicationSection} id="apply">
          <div className={styles.applicationHeading}>
            <span className={styles.eyebrow}>Secure Partner application</span>
            <h1>Tell us about the healthcare business you want to build.</h1>
            <p>
              Complete the secure application below. If you select multiple counties, you will also
              choose the primary market for your personal calendars and Partner website.
            </p>
          </div>
          <div className={styles.formFrameShell}>
            <div className={styles.formFrameTopbar}>
              <div><span aria-hidden="true" /> Secure application</div>
              <p>My Drip Nurse Partner Network</p>
            </div>
            <iframe
              className={styles.applicationFrame}
              src={embeddedApplicationUrl}
              title="My Drip Nurse Partner application"
            />
          </div>
          <p className={styles.applicationFinePrint}>
            Submission does not guarantee acceptance, territory availability, appointments, or income.
            Applications are reviewed before activation.
          </p>
          <Link href={partnerHref("/become-a-partner")} className={styles.textLink}>← Return to Partner program details</Link>
        </section>
      </main>
      <PartnerFooter />
    </PartnerExperience>
  );
}
