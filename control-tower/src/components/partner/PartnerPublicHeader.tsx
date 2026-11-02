import { clinicSiteAddress, clinicNurseSiteAddress } from "@/lib/clinicDomainLookup";
import { definitionForCalendar } from "@/lib/myDripNurseServices";
import { publicWebsiteAccounts } from "@/lib/publicWebsiteAccounts";
import { clinicWebsiteBrand } from "@/lib/clinicWebsiteBrand";
import { publicClinicServices } from "@/lib/clinicBooking";
import type { PublicPartnerProfile } from "@/lib/partnerProfiles";
import MarketingHeaderEmbed, {
  type MarketingHeaderMenuLink,
  type MarketingHeaderNavLink,
} from "@/components/marketing/MarketingHeaderEmbed";
import { loadPartnerCalendarServices, partnerServiceSlug } from "@/lib/myDripNurseServices";
import type { PartnerService } from "@/lib/partnerProfiles";

type PartnerPublicHeaderProfile = {
  id: string;
  slug: string;
  displayName: string;
  profilePhotoUrl: string;
  organizationId: string;
  services: PartnerService[];
  clinicManaged?: boolean;
  clinicBrand?: PublicPartnerProfile['clinicBrand'];
};

export default async function PartnerPublicHeader({
  profile,
  preview = "",
}: {
  profile: PartnerPublicHeaderProfile;
  preview?: string;
}) {
  const [accounts, services] = await Promise.all([
    publicWebsiteAccounts(),
    // Reuse the nurse-filtered public clinic cache, including its assignment invalidation.
    // Clinic-only profiles must never fall back to the independent partner catalog.
    profile.clinicBrand && !preview
      ? publicClinicServices(profile.clinicBrand.id, profile.id).then(rows => rows.map(service => {
          const definition = definitionForCalendar(service.name);
          return { id: definition?.id || service.slug, name: service.name, imageUrl: service.imageUrl,
            landingPath: `/${definition ? partnerServiceSlug(definition) : service.slug}` };
        }))
      : profile.clinicManaged && !preview
        ? Promise.resolve([])
        : loadPartnerCalendarServices(profile.organizationId, profile.services, profile.id),
  ]);
  const [nurseHome, clinicSite] = await Promise.all([clinicNurseSiteAddress(profile), profile.clinicBrand ? clinicSiteAddress(profile.clinicBrand) : Promise.resolve(null)]);
  const previewQuery = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const serviceLink = (service: (typeof services)[number]): MarketingHeaderMenuLink => [
    service.name,
    `${nurseHome}/services/${partnerServiceSlug(service)}${previewQuery}`,
    service.imageUrl,
  ];
  const ivMenuLinks = services.filter((service) => !service.id.startsWith("nad-")).map(serviceLink);
  const nadMenuLinks = services.filter((service) => service.id.startsWith("nad-")).map(serviceLink);
  const additionalNavLinks: MarketingHeaderNavLink[] = [[
    "Become a Partner",
    `${nurseHome}/become-a-partner${previewQuery}`,
  ]];

  return (
    <MarketingHeaderEmbed
      {...accounts}
      brand={profile.clinicBrand ? { name: profile.clinicBrand.name, logoUrl: profile.clinicBrand.logoUrl, ...clinicWebsiteBrand(profile.clinicBrand) } : undefined}
      teamLoginHref={clinicSite?.home.startsWith("https://") ? `${clinicSite.home}/login` : profile.clinicBrand ? `https://partners.mydripnurse.com/clinic-login/${encodeURIComponent(profile.clinicBrand.slug)}` : undefined}
      refreshServiceMedia={false}
      location="your area"
      phone="321-989-6446"
      websiteUrl={clinicSite?.canonicalHome || `${nurseHome}${previewQuery}`}
      bannerText="Licensed Nurses · Same-Day Appointments · Verified Mobile IV Care"
      showPartnerPortal
      showDirectory={false}
      showWeightLoss={false}
      showContact={false}
      showPhone={false}
      ivMenuLinks={ivMenuLinks}
      nadMenuLinks={nadMenuLinks}
      additionalNavLinks={additionalNavLinks}
      nativeNavigation
    />
  );
}
