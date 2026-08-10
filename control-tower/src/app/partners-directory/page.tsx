import type { Metadata } from "next";

import {
  PartnerExperience,
  PartnerFooter,
  PartnerHeader,
} from "@/components/partner/PartnerBrand";
import { resolvePartnerAreaCoordinates } from "@/lib/partnerDirectoryGeo";
import { loadPartnerCities } from "@/lib/partnerServiceAreas";
import { listPublicPartnerProfiles, type PublicPartnerProfile } from "@/lib/partnerProfiles";

import PartnerDirectoryClient, { type DirectoryPartner } from "./PartnerDirectoryClient";
import styles from "./PartnerDirectory.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Meet Our Partners | My Drip Nurse",
  description: "Meet trusted local My Drip Nurse Partners providing mobile IV therapy in their communities.",
  keywords: [
    "My Drip Nurse Partners",
    "mobile IV therapy near me",
    "mobile IV therapy Partner directory",
    "local IV hydration providers",
  ],
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
    websiteStatus: "published", affiliateCode: "alexandra-rivera",
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
    websiteStatus: "published", affiliateCode: "marcus-bennett",
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
    websiteStatus: "published", affiliateCode: "sofia-patel",
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
    websiteStatus: "published", affiliateCode: "daniel-brooks",
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
    websiteStatus: "published", affiliateCode: "naomi-chen",
  },
];

type Props = { searchParams: Promise<{ preview?: string }> };

function normalizeLocationName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(county|parish|borough|municipality|census area)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function PartnersDirectoryPage({ searchParams }: Props) {
  const { preview: previewParam } = await searchParams;
  const preview = previewParam === "1";
  const profiles = preview ? PREVIEW_PARTNERS : await listPublicPartnerProfiles();
  const partners: DirectoryPartner[] = await Promise.all(
    profiles.map(async (profile) => {
      const explicitCityAreas = profile.serviceAreas.filter((area) => area.city);
      const cities = explicitCityAreas.length || !profile.organizationId
        ? []
        : await loadPartnerCities(profile.organizationId, profile.serviceAreas);
      const mapAreas = cities.length
        ? cities.flatMap((city) => {
            const area = profile.serviceAreas.find(
              (candidate) =>
                normalizeLocationName(candidate.county) === normalizeLocationName(city.county || "") &&
                normalizeLocationName(candidate.state) === normalizeLocationName(city.state),
            );
            return area ? [{ ...area, city: city.name }] : [];
          })
        : profile.serviceAreas;
      const resolvedPoints = await Promise.all(mapAreas.map((area) => resolvePartnerAreaCoordinates(area)));
      const seenPoints = new Set<string>();
      return {
        ...profile,
        mapPoints: resolvedPoints.filter((point): point is NonNullable<typeof point> => {
          if (!point) return false;
          const key = `${point.city || point.county}:${point.state}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`;
          if (seenPoints.has(key)) return false;
          seenPoints.add(key);
          return true;
        }),
      };
    }),
  );

  return (
    <PartnerExperience>
      <main className={styles.page}>
        <PartnerHeader
          navItems={[
            { href: "/", label: "Find a Partner" },
            { href: "https://mydripnurse.com", label: "My Drip Nurse" },
          ]}
          action={{
            href: "https://orange-county.mydripnurse.com/become-a-partner",
            label: "Become a Partner",
          }}
        />

        <section className={styles.hero}>
          <div className={styles.shell}>
            <div className={styles.networkBadge}><i /> Live Partner Network</div>
            <h1>Trusted mobile IV care, <em>right where you are.</em></h1>
            <p>Discover verified My Drip Nurse Partners, explore their coverage areas, and book with confidence.</p>
            <div className={styles.heroSignals}>
              <span>Verified professionals</span>
              <span>Local service areas</span>
              <span>Secure online booking</span>
            </div>
          </div>
        </section>

        <PartnerDirectoryClient partners={partners} preview={preview} />

        <PartnerFooter />
      </main>
    </PartnerExperience>
  );
}
