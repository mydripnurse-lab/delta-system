import type { Metadata } from "next";
import { providerCoverage, publishedServiceNames } from "@/lib/providerSeo";

import type { PublicPartnerProfile } from "@/lib/partnerProfiles";

export const PARTNER_SITE_ORIGIN = "https://partners.mydripnurse.com";

function cleanPath(pathname: string) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return path === "/" ? path : path.replace(/\/+$/, "");
}

export function partnerPublicUrl(profile: string | { slug: string; publicWebsiteUrl?: string }, pathname = "") {
  const slug = typeof profile === "string" ? profile : profile.slug;
  if (typeof profile !== "string" && profile.publicWebsiteUrl && !/(?:^|\/)(?:book|apply)$/.test(pathname)) {
    return `${profile.publicWebsiteUrl}${pathname ? cleanPath(pathname) : ""}`;
  }
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
  const canonical = partnerPublicUrl(opts.profile, opts.pathname || "");
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

export function buildPartnerStructuredData(profile: PublicPartnerProfile) {
  const url = partnerPublicUrl(profile);
  const services = publishedServiceNames(profile.services);
  const person = {
    "@type": "Person", "@id": `${url}#partner`, name: profile.displayName, url,
    image: profile.profilePhotoUrl || undefined,
    jobTitle: profile.publicTitle || undefined,
    description: profile.biography || undefined,
    honorificSuffix: profile.professionalCredentials || undefined,
    affiliation: profile.clinicBrand?.name ? { "@type": "Organization", name: profile.clinicBrand.name } : undefined,
    knowsAbout: services,
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      person,
      { "@type": "ProfilePage", "@id": `${url}#webpage`, url, name: profile.displayName, mainEntity: { "@id": person["@id"] } },
      ...services.map((name, index) => ({
        "@type": "Service", "@id": `${url}#offered-service-${index + 1}`, name,
        url: partnerPublicUrl(profile, "services"), provider: { "@id": person["@id"] },
        areaServed: providerCoverage(profile.serviceAreas).map(area => area.schema),
      })),
    ],
  };
}

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
