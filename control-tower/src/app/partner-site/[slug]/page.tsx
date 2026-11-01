import { nurseLocationContext, nurseIdentity, nurseCareIntroduction } from "@/lib/partnerPublicContent";
import { ClinicCoverageSearch } from "@/components/clinics/ClinicCoverageSearch";
import { clinicWebsiteBrand } from "@/lib/clinicWebsiteBrand";
import { providerCoverage, publishedServiceNames } from "@/lib/providerSeo";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PartnerExperience,
  PartnerFooter,
} from "@/components/partner/PartnerBrand";
import PartnerPublicHeader from "@/components/partner/PartnerPublicHeader";
import { PartnerFaq, type PartnerFaqItem } from "@/components/partner/PartnerFaq";
import { PartnerVerifiedReviews } from "@/components/partner/PartnerVerifiedReviews";
import { PartnerDirectoryAttribution } from "@/components/partner/PartnerDirectoryAttribution";
import { getPartnerProfileForPublicPage } from "@/lib/partnerProfiles";
import { loadPartnerCoverageCounties } from "@/lib/partnerServiceAreas";
import { getPublicPartnerReviews } from "@/lib/partnerReviews";
import {
  buildPartnerMetadata,
  buildPartnerStructuredData,
  serializeStructuredData,
} from "@/lib/partnerSeo";

import styles from "./partnerSite.module.css";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { preview = "" } = await searchParams;
  const profile = await getPartnerProfileForPublicPage(slug, preview);
  if (!profile) return { title: "Mobile IV care | My Drip Nurse" };
  const coverageCounties = (profile.clinicManaged || profile.clinicBrand) ? [] : await loadPartnerCoverageCounties(profile.serviceAreas);
  const cities = coverageCounties.flatMap((county) => county.communities);
  const localSummary = nurseLocationContext(profile.serviceAreas);
  return buildPartnerMetadata({
    profile,
    title: `${profile.displayName}${profile.professionalCredentials ? `, ${profile.professionalCredentials}` : ""} | Mobile IV care${localSummary ? ` in ${localSummary}` : ""}`,
    description: `Book mobile IV care with ${nurseIdentity(profile)}${localSummary ? ` in ${localSummary}` : ""}. Compare services, prices and available appointment times.`,
    keywords: cities.slice(0, 8).flatMap((city) => [
      `mobile IV therapy ${city.name}`,
      `IV hydration ${city.name}`,
    ]),
    indexable: !preview,
  });
}

export default async function PartnerSitePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview = "" } = await searchParams;
  const profile = await getPartnerProfileForPublicPage(slug, preview);
  if (!profile) notFound();
  const coverageCounties = (profile.clinicManaged || profile.clinicBrand) ? [] : await loadPartnerCoverageCounties(profile.serviceAreas);
  const reviewData = preview
    ? { summary: { averageRating: 0, reviewCount: 0 }, reviews: [] }
    : await getPublicPartnerReviews(profile.id);
  const previewQuery = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const partnerHref = (pathname = "") => `/${profile.slug}${pathname}${previewQuery}`;

  const coverage = providerCoverage(profile.serviceAreas);
  const offeredNames = publishedServiceNames(profile.services);
  const serviceAreaLabel = nurseLocationContext(profile.serviceAreas);
  const structuredData = buildPartnerStructuredData(profile);
  const faqItems: PartnerFaqItem[] = [
    {
      question: `Where does ${profile.displayName} provide mobile IV therapy?`,
      answer: "Use the service-area search on this page to find your city or region. Enter your visit address during booking to confirm coverage and available times.",
    },
    {
      question: "How do I book an appointment?",
      answer: "Open the Services page, review the available treatments and current prices, then use the secure booking calendar to select an available appointment time.",
    },
    {
      question: "Which mobile IV services are available?",
      answer: offeredNames.length ? `${profile.displayName} lists ${offeredNames.join(", ")}. Check the service page for stock status, pricing and availability at your address.` : "No services are currently listed for this profile. Check the Services page for updates.",
    },
    {
      question: "Will I see the price before booking?",
      answer: "Yes. Current service prices appear on the Services page. Any applicable deposit or additional booking terms are shown during the booking process.",
    },
    {
      question: "Is mobile IV therapy appropriate for everyone?",
      answer: "Not always. Eligibility and treatment suitability must be evaluated by an appropriately qualified healthcare professional. Mobile IV therapy is not a substitute for emergency care.",
    },
  ];
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <PartnerExperience branding={profile.clinicBrand ? clinicWebsiteBrand(profile.clinicBrand) : undefined}>
      <main className={styles.page}>
        <PartnerDirectoryAttribution partnerProfileId={profile.id} disabled={Boolean(preview)} />
        {preview ? (
          <div role="status" style={{ background: "#073f4b", color: "white", padding: "10px 20px", textAlign: "center", fontWeight: 700 }}>
            Private website preview · This page is not published yet
          </div>
        ) : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(faqStructuredData) }}
        />
        <PartnerPublicHeader profile={profile} preview={preview} />

        <section className={styles.hero}>
          <div className={styles.shell}>
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}>{profile.publicTitle || "Mobile IV care"}{profile.professionalCredentials ? ` · ${profile.professionalCredentials}` : ""}</span>
              <h1>Personalized IV care with <em>{profile.displayName}</em>.</h1>
              <p>
                {nurseCareIntroduction(profile)}
              </p>
              <div className={styles.actions}>
                <Link href={partnerHref("/services")} className={styles.primaryAction}>
                  View services & availability <span aria-hidden="true">→</span>
                </Link>
                <a href="#meet-your-partner" className={styles.secondaryAction}>Meet your care professional</a>
              </div>
            </div>

            <div className={styles.profileCard}>
              {profile.profilePhotoUrl ? (
                <Image
                  src={profile.profilePhotoUrl}
                  alt={profile.displayName}
                  title={`Mobile IV therapy with ${profile.displayName}`}
                  width={680}
                  height={760}
                  className={styles.heroPhoto}
                  priority
                />
              ) : (
                <div className={styles.photoFallback}>{profile.displayName.slice(0, 1)}</div>
              )}
              <div className={styles.profileCardCopy}>
                <strong>{profile.displayName}</strong>
                {profile.businessName ? <b>{profile.businessName}</b> : null}
                <span>{profile.publicTitle || profile.clinicBrand?.name || "Mobile IV care"}</span>
                {profile.professionalCredentials ? <small>{profile.professionalCredentials}</small> : null}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.trustStrip} aria-label="Care benefits">
          <div className={styles.shell}>
            <span>Mobile care</span>
            <span>Trusted local care</span>
            <span>Secure online booking</span>
            <span>My Drip Nurse network</span>
          </div>
        </section>

        <section className={styles.about} id="meet-your-partner">
          <div className={styles.shell}>
            <div>
              <span className={styles.eyebrow}>Meet your local care professional</span>
              <h2>Meet {profile.displayName}.</h2>
            </div>
            <div className={styles.aboutCopy}>
              {profile.biography.trim() ? <p>{profile.biography}</p> : <p>{nurseIdentity(profile)}{profile.clinicBrand?.name ? ` is part of the care team at ${profile.clinicBrand.name}` : " provides mobile IV care"}. Review the services below and choose an appointment that fits your schedule.</p>}
              {serviceAreaLabel ? <p>Mobile appointments in {serviceAreaLabel}. Check your address when booking.</p> : null}
              {profile.businessName ? <strong>{profile.businessName}</strong> : null}
            </div>
          </div>
        </section>

        {coverage.length ? <section className={styles.cityCoverage} aria-labelledby="partner-city-coverage">
          <div className={styles.shell}>
            <div className={styles.cityCoverageHeading}>
              <span className={styles.eyebrow}>Areas we serve</span>
              <h2 id="partner-city-coverage">Where {profile.displayName} provides care</h2>
              <p>Find your city or region below, then check appointment availability for your address.</p>
            </div>
            <ClinicCoverageSearch areas={[
              ...coverage.map(area => area.label),
              ...coverageCounties.flatMap(county => county.communities.map(community => `${community.name}, ${county.county}, ${county.state}`)),
            ]}/>
          </div>
        </section> : null}
        <PartnerVerifiedReviews summary={reviewData.summary} reviews={reviewData.reviews} />

        <section className={styles.servicesCta}>
          <div className={styles.shell}>
            <span className={styles.eyebrow}>Mobile IV therapy</span>
            <h2>Find the service that fits how you want to feel.</h2>
            <p>{offeredNames.length ? "Compare ingredients and prices, then check appointment times for your visit. Your address confirms the total and deposit before payment." : "No services are currently available to book. Please check back for updates."}</p>
            <Link href={partnerHref("/services")} className={styles.primaryAction}>
              View services and book <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <PartnerFaq
          title="Helpful answers before you book."
          introduction={`Learn more about booking mobile IV therapy with ${profile.displayName} and the My Drip Nurse care network.`}
          items={faqItems}
        />

        <PartnerFooter branding={profile.clinicBrand} />
      </main>
    </PartnerExperience>
  );
}
