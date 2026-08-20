import type { Metadata } from "next";

import MarketingHeaderEmbed from "@/components/marketing/MarketingHeaderEmbed";
import { PartnerExperience } from "@/components/partner/PartnerBrand";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { enrichDirectoryProfiles } from "@/lib/partnerDirectory";
import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import { listPublicPartnerProfiles, type PublicPartnerProfile } from "@/lib/partnerProfiles";
import { PARTNER_SITE_ORIGIN, serializeStructuredData } from "@/lib/partnerSeo";
import { getPartnerReviewSummaries } from "@/lib/partnerReviews";

import PartnerDirectoryClient, { type DirectoryPartner } from "./PartnerDirectoryClient";
import styles from "./PartnerDirectory.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mobile IV Therapy Near You | My Drip Nurse Partner Directory",
  description: "Find verified My Drip Nurse mobile IV therapy Partners near you. Compare local coverage, services and professional profiles across the United States.",
  keywords: [
    "My Drip Nurse Partners",
    "mobile IV therapy near me",
    "mobile IV therapy Partner directory",
    "local IV hydration providers",
  ],
  alternates: { canonical: PARTNER_SITE_ORIGIN },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "My Drip Nurse Partner Directory",
    url: PARTNER_SITE_ORIGIN,
    title: "Find Mobile IV Therapy Near You | My Drip Nurse",
    description: "Explore verified local mobile IV therapy Partners, service areas and booking options.",
  },
};

const PREVIEW_PARTNERS: PublicPartnerProfile[] = [
  {
    id: "preview-alexandra", organizationId: "", slug: "template-preview", displayName: "Alexandra Rivera",
    businessName: "Sunshine IV Wellness", publicTitle: "Registered Nurse & Mobile IV Therapy Partner",
    professionalCredentials: "RN, BSN", biography: "Compassionate mobile IV care built around each patient.",
    profilePhotoUrl: "", primaryLocationId: "preview-orange", groupCalendarId: "preview", groupCalendarUrl: "",
    services: [
      { calendarId: "a1", name: "Hydration IV Therapy", status: "active" },
      { calendarId: "a2", name: "Energy & Wellness IV", status: "active" },
      { calendarId: "a3", name: "Immune Support IV", status: "active" },
    ],
    serviceAreas: [
      { state: "Florida", county: "Orange County", locationId: "preview-orange" },
      { state: "Florida", county: "Osceola County", locationId: "preview-osceola" },
    ],
    websiteStatus: "published", directoryStatus: "published", affiliateCode: "alexandra-rivera",
  },
  {
    id: "preview-marcus", organizationId: "", slug: "template-preview", displayName: "Marcus Bennett",
    businessName: "Bay Wellness Collective", publicTitle: "Mobile Wellness Partner",
    professionalCredentials: "RN", biography: "Professional wellness support throughout the Tampa Bay area.",
    profilePhotoUrl: "", primaryLocationId: "preview-hillsborough", groupCalendarId: "preview", groupCalendarUrl: "",
    services: [
      { calendarId: "m1", name: "Hydration IV Therapy", status: "active" },
      { calendarId: "m2", name: "Recovery IV", status: "active" },
    ],
    serviceAreas: [{ state: "Florida", county: "Hillsborough County", locationId: "preview-hillsborough" }],
    websiteStatus: "published", directoryStatus: "published", affiliateCode: "marcus-bennett",
  },
  {
    id: "preview-sofia", organizationId: "", slug: "template-preview", displayName: "Sofia Patel",
    businessName: "Coastal Drip Care", publicTitle: "Mobile IV Therapy Partner",
    professionalCredentials: "RN, CCRN", biography: "Modern mobile care delivered with a calm, clinical approach.",
    profilePhotoUrl: "", primaryLocationId: "preview-broward", groupCalendarId: "preview", groupCalendarUrl: "",
    services: [
      { calendarId: "s1", name: "Hydration IV Therapy", status: "active" },
      { calendarId: "s2", name: "Beauty & Glow IV", status: "active" },
      { calendarId: "s3", name: "Migraine Relief IV", status: "active" },
    ],
    serviceAreas: [
      { state: "Florida", county: "Broward County", locationId: "preview-broward" },
      { state: "Florida", county: "Miami-Dade County", locationId: "preview-miami" },
    ],
    websiteStatus: "published", directoryStatus: "published", affiliateCode: "sofia-patel",
  },
  {
    id: "preview-daniel", organizationId: "", slug: "template-preview", displayName: "Daniel Brooks",
    businessName: "Central Florida IV", publicTitle: "Concierge Wellness Partner",
    professionalCredentials: "RN", biography: "Convenient, patient-first IV care across Central Florida.",
    profilePhotoUrl: "", primaryLocationId: "preview-seminole", groupCalendarId: "preview", groupCalendarUrl: "",
    services: [
      { calendarId: "d1", name: "Hydration IV Therapy", status: "active" },
      { calendarId: "d2", name: "Athletic Recovery IV", status: "active" },
    ],
    serviceAreas: [{ state: "Florida", county: "Seminole County", locationId: "preview-seminole" }],
    websiteStatus: "published", directoryStatus: "published", affiliateCode: "daniel-brooks",
  },
  {
    id: "preview-naomi", organizationId: "", slug: "template-preview", displayName: "Naomi Chen",
    businessName: "Palm Coast Wellness", publicTitle: "Mobile IV Therapy Partner",
    professionalCredentials: "BSN, RN", biography: "Thoughtful wellness care tailored to every visit.",
    profilePhotoUrl: "", primaryLocationId: "preview-palm-beach", groupCalendarId: "preview", groupCalendarUrl: "",
    services: [
      { calendarId: "n1", name: "Hydration IV Therapy", status: "active" },
      { calendarId: "n2", name: "Immune Support IV", status: "active" },
    ],
    serviceAreas: [{ state: "Florida", county: "Palm Beach County", locationId: "preview-palm-beach" }],
    websiteStatus: "published", directoryStatus: "published", affiliateCode: "naomi-chen",
  },
];

type Props = { searchParams: Promise<{ preview?: string }> };

export default async function PartnersDirectoryPage({ searchParams }: Props) {
  const { preview: previewParam } = await searchParams;
  const preview = previewParam === "1";
  const profiles = preview ? PREVIEW_PARTNERS : await listPublicPartnerProfiles();
  const enrichedPartners = await enrichDirectoryProfiles(profiles);
  const reviewSummaries = preview
    ? new Map()
    : await getPartnerReviewSummaries(enrichedPartners.map((partner) => partner.id));
  const partners: DirectoryPartner[] = enrichedPartners.map((partner) => ({
    ...partner,
    reviewSummary: reviewSummaries.get(partner.id) || { averageRating: 0, reviewCount: 0 },
  }));
  const [clientAccount, partnerSession] = await Promise.all([
    getAuthenticatedClient(),
    getPartnerPortalSession(),
  ]);
  const signedInPartner = partnerSession
    ? partners.find((partner) => partner.id === partnerSession.profile_id) || null
    : null;
  const directoryJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${PARTNER_SITE_ORIGIN}/#organization`,
        name: "My Drip Nurse",
        url: "https://mydripnurse.com",
        logo: `${PARTNER_SITE_ORIGIN}/mdn-logo.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${PARTNER_SITE_ORIGIN}/#website`,
        name: "My Drip Nurse Partner Directory",
        url: PARTNER_SITE_ORIGIN,
        publisher: { "@id": `${PARTNER_SITE_ORIGIN}/#organization` },
      },
      {
        "@type": "ItemList",
        name: "Verified My Drip Nurse Partners",
        numberOfItems: partners.length,
        itemListElement: partners.map((partner, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${PARTNER_SITE_ORIGIN}/${partner.slug}`,
          name: partner.displayName,
        })),
      },
    ],
  };

  return (
    <PartnerExperience>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(directoryJsonLd) }} />
      <main className={styles.page}>
        <MarketingHeaderEmbed
          account={clientAccount ? {
            fullName: clientAccount.fullName,
            email: clientAccount.email,
            photoUrl: clientAccount.profilePhotoUrl,
            photoUpdatedAt: clientAccount.profilePhotoUpdatedAt,
          } : null}
          partnerAccount={partnerSession ? {
            fullName: signedInPartner?.displayName || partnerSession.display_name,
            email: partnerSession.email,
            photoUrl: signedInPartner?.profilePhotoUrl || "",
            photoUpdatedAt: "",
            profileHref: signedInPartner?.slug ? `https://partners.mydripnurse.com/${signedInPartner.slug}` : undefined,
          } : null}
          location="your area"
          phone="1 (833) 381-0071"
          websiteUrl="https://mydripnurse.com"
          bannerText="Licensed Nurses · Same-Day Appointments · Verified Mobile IV Care"
          preferPreviousMdnOrigin
          showPartnerPortal
          showDirectory={false}
          showWeightLoss={false}
          showContact={false}
          nativeNavigation
        />

        <PartnerDirectoryClient partners={partners} preview={preview} />
      </main>
    </PartnerExperience>
  );
}
