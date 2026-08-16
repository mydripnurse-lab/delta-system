import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PartnerExperience,
  PartnerFooter,
  PartnerHeader,
} from "@/components/partner/PartnerBrand";
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
  const coverageCounties = await loadPartnerCoverageCounties(profile.serviceAreas);
  const cities = coverageCounties.flatMap((county) => county.communities);
  const localSummary = cities.slice(0, 4).map((city) => city.name).join(", ");
  return buildPartnerMetadata({
    profile,
    title: `${profile.displayName} | My Drip Nurse`,
    description: localSummary
      ? `Book mobile IV therapy with ${profile.displayName}, serving ${localSummary} and surrounding communities.`
      : profile.biography || `Meet ${profile.displayName}, a trusted My Drip Nurse care professional.`,
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
  const coverageCounties = await loadPartnerCoverageCounties(profile.serviceAreas);
  const reviewData = preview
    ? { summary: { averageRating: 0, reviewCount: 0 }, reviews: [] }
    : await getPublicPartnerReviews(profile.id);
  const cities = coverageCounties.flatMap((county) => county.communities);
  const previewQuery = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const partnerHref = (pathname = "") => `/${profile.slug}${pathname}${previewQuery}`;

  const featuredCities = cities.slice(0, 4).map((city) => city.name);
  const serviceAreaLabel = featuredCities.length
    ? new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(featuredCities)
    : "your local area";
  const structuredData = buildPartnerStructuredData(profile, cities);
  const faqItems: PartnerFaqItem[] = [
    {
      question: `Where does ${profile.displayName} provide mobile IV therapy?`,
      answer: `${profile.displayName} currently serves ${serviceAreaLabel}${cities.length > featuredCities.length ? " and surrounding communities" : ""}. Appointment availability can vary and is confirmed during online booking.`,
    },
    {
      question: "How do I book an appointment?",
      answer: "Open the Services page, review the available treatments and current prices, then use the secure booking calendar to select an available appointment time.",
    },
    {
      question: "Which mobile IV services are available?",
      answer: "The Services page lists the currently available My Drip Nurse treatments. Final availability depends on the service calendar, location, and appointment eligibility.",
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
    <PartnerExperience>
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
        <PartnerHeader
          navItems={[
            { href: partnerHref(), label: "Home" },
            { href: partnerHref("/services"), label: "Services" },
            { href: partnerHref("/become-a-partner"), label: "Join our network" },
          ]}
          action={{ href: partnerHref("/services"), label: "Book an IV" }}
        />

        <section className={styles.hero}>
          <div className={styles.shell}>
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}>Verified My Drip Nurse care</span>
              <h1>Personalized IV care with <em>{profile.displayName}</em>.</h1>
              <p>
                Mobile IV therapy delivered with a thoughtful, patient-first approach throughout {serviceAreaLabel}.
              </p>
              <div className={styles.actions}>
                <Link href={partnerHref("/services")} className={styles.primaryAction}>
                  Explore services <span aria-hidden="true">→</span>
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
                <span>{profile.publicTitle || "My Drip Nurse care"}</span>
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
              <h2>Care that feels personal, professional, and close to home.</h2>
            </div>
            <div className={styles.aboutCopy}>
              <p>{profile.biography}</p>
              {profile.businessName ? <strong>{profile.businessName}</strong> : null}
            </div>
          </div>
        </section>

        {coverageCounties.length ? (
          <section className={styles.cityCoverage} aria-labelledby="partner-city-coverage">
            <div className={styles.shell}>
              <div className={styles.cityCoverageHeading}>
                <span className={styles.eyebrow}>Areas we serve</span>
                <h2 id="partner-city-coverage">County-wide care, close to home.</h2>
                <p>
                  Every verified address inside a listed county or Puerto Rico municipio is eligible for coverage.
                  Live appointment times still depend on the selected service and care professional availability.
                </p>
              </div>
              <div className={styles.countyCoverageList} aria-label="Counties and communities served">
                {coverageCounties.map((county, index) => (
                  <details
                    className={styles.countyCoverageCard}
                    key={county.countyGeoid}
                    open={coverageCounties.length === 1 || index === 0}
                  >
                    <summary className={styles.countyCoverageSummary}>
                      <span>
                        <strong>{county.county}</strong>
                        <small>{county.state}</small>
                      </span>
                      <b>
                        {county.communities.length
                          ? `${county.communities.length} ${county.communities.length === 1 ? "community" : "communities"}`
                          : "County-wide coverage"}
                      </b>
                      <i aria-hidden="true">⌄</i>
                    </summary>
                    <div className={styles.communityGrid}>
                      {county.communities.length ? county.communities.map((community) => (
                        <span key={`${county.countyGeoid}-${community.geoid || community.name}`}>
                          {community.name}
                        </span>
                      )) : (
                        <p>All verified addresses in this county are evaluated during booking.</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <PartnerVerifiedReviews summary={reviewData.summary} reviews={reviewData.reviews} />

        <section className={styles.servicesCta}>
          <div className={styles.shell}>
            <span className={styles.eyebrow}>Mobile IV therapy</span>
            <h2>Find the service that fits how you want to feel.</h2>
            <p>Review available treatments, transparent pricing, and real-time appointment availability.</p>
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

        <PartnerFooter />
      </main>
    </PartnerExperience>
  );
}
