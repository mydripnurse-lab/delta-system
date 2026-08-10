import type { Metadata } from "next";

import type { PublicPartnerProfile } from "@/lib/partnerProfiles";
import type { PartnerCity } from "@/lib/partnerServiceAreas";

export const PARTNER_SITE_ORIGIN = "https://partners.mydripnurse.com";

function cleanPath(pathname: string) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return path === "/" ? path : path.replace(/\/+$/, "");
}

export function partnerPublicUrl(slug: string, pathname = "") {
  const suffix = cleanPath(`/${slug}${pathname ? `/${pathname.replace(/^\/+/, "")}` : ""}`);
  return `${PARTNER_SITE_ORIGIN}${suffix}`;
}

export function buildPartnerMetadata(opts: {
  profile: PublicPartnerProfile;
  pathname?: string;
  title: string;
  description: string;
  indexable?: boolean;
  keywords?: string[];
}): Metadata {
  const canonical = partnerPublicUrl(opts.profile.slug, opts.pathname || "");
  const socialImage = partnerPublicUrl(opts.profile.slug, "opengraph-image");
  const imageAlt = `${opts.profile.displayName}, ${opts.profile.professionalCredentials || "My Drip Nurse Partner"}`;
  const keywords = [...new Set([
    ...(opts.keywords || []),
    "mobile IV therapy",
    "IV hydration",
    "mobile IV therapy near me",
    `${opts.profile.displayName} mobile IV therapy`,
    `${opts.profile.businessName || opts.profile.displayName} IV therapy`,
    "My Drip Nurse Partner",
  ].map((keyword) => keyword.trim()).filter(Boolean))];

  return {
    title: opts.title,
    description: opts.description,
    keywords,
    alternates: { canonical },
    robots: opts.indexable === false
      ? { index: false, follow: false, noarchive: true }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: "My Drip Nurse Partners",
      url: canonical,
      title: opts.title,
      description: opts.description,
      images: [{ url: socialImage, width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images: [{ url: socialImage, alt: imageAlt }],
    },
  };
}

export function buildPartnerStructuredData(profile: PublicPartnerProfile, cities: PartnerCity[] = []) {
  const url = partnerPublicUrl(profile.slug);
  const serviceAreas = cities.length
    ? cities.map((city) => ({
        "@type": "City",
        name: city.name,
        containedInPlace: { "@type": "State", name: city.state },
      }))
    : profile.serviceAreas.map((area) => ({
        "@type": "AdministrativeArea",
        name: `${area.county}, ${area.state}`,
      }));

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${url}#partner`,
    name: profile.displayName,
    url,
    image: profile.profilePhotoUrl || undefined,
    jobTitle: profile.publicTitle || "My Drip Nurse Partner",
    description: profile.biography || undefined,
    honorificSuffix: profile.professionalCredentials || undefined,
    worksFor: {
      "@type": "Organization",
      name: profile.businessName || "My Drip Nurse",
      parentOrganization: {
        "@type": "Organization",
        name: "My Drip Nurse",
        url: "https://mydripnurse.com",
      },
    },
    areaServed: serviceAreas,
    knowsAbout: profile.services.map((service) => service.name),
  };
}

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
