import { publicWebsiteAccounts } from "@/lib/publicWebsiteAccounts";
import { clinicWebsiteBrand } from "@/lib/clinicWebsiteBrand";
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
    loadPartnerCalendarServices(profile.organizationId, profile.services, profile.id),
  ]);
  const previewQuery = preview ? `?preview=${encodeURIComponent(preview)}` : "";
  const serviceLink = (service: (typeof services)[number]): MarketingHeaderMenuLink => [
    service.name,
    `https://partners.mydripnurse.com/${profile.slug}/services/${partnerServiceSlug(service)}${previewQuery}`,
    service.imageUrl,
  ];
  const ivMenuLinks = services.filter((service) => !service.id.startsWith("nad-")).map(serviceLink);
  const nadMenuLinks = services.filter((service) => service.id.startsWith("nad-")).map(serviceLink);
  const additionalNavLinks: MarketingHeaderNavLink[] = [[
    "Become a Partner",
    `https://partners.mydripnurse.com/${profile.slug}/become-a-partner${previewQuery}`,
  ]];

  if (profile.clinicBrand) additionalNavLinks.unshift(["Our clinic", `https://partners.mydripnurse.com/clinics/${profile.clinicBrand.slug}`]);

  return (
    <MarketingHeaderEmbed
      {...accounts}
      brand={profile.clinicBrand ? { name: profile.clinicBrand.name, logoUrl: profile.clinicBrand.logoUrl, ...clinicWebsiteBrand(profile.clinicBrand) } : undefined}
      teamLoginHref={profile.clinicBrand ? `https://partners.mydripnurse.com/clinic-login/${encodeURIComponent(profile.clinicBrand.slug)}` : undefined}
      refreshServiceMedia={false}
      location="your area"
      phone="321-989-6446"
      websiteUrl={`https://partners.mydripnurse.com/${profile.slug}${previewQuery}`}
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
