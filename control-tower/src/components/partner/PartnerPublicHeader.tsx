import Image from "next/image";
import type { PublicPartnerProfile } from "@/lib/partnerProfiles";
import Link from "next/link";
import clinicStyles from "@/components/clinics/clinic.module.css";
import MarketingHeaderEmbed, {
  type MarketingHeaderMenuLink,
  type MarketingHeaderNavLink,
} from "@/components/marketing/MarketingHeaderEmbed";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { loadPartnerCalendarServices, partnerServiceSlug } from "@/lib/myDripNurseServices";
import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
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
  if ((profile.clinicManaged || profile.clinicBrand) && !preview) return <header className={`${clinicStyles.shell} ${clinicStyles.publicHeader}`}>
    <nav className={clinicStyles.head} aria-label="Professional website navigation">
      <Link href={`/${profile.slug}`}><span className={clinicStyles.eyebrow}>{profile.clinicBrand?.logoUrl ? <Image src={profile.clinicBrand.logoUrl} alt={profile.clinicBrand.name} width={180} height={64} unoptimized style={{ objectFit: "contain", maxHeight: 64 }} /> : profile.clinicBrand?.name || "My Drip Nurse"}</span><strong>{profile.displayName}</strong></Link>
      <div className={clinicStyles.actions}><Link className={clinicStyles.secondary} href={`/${profile.slug}/services`}>Services & booking</Link>
        <Link className={clinicStyles.secondary} href={profile.clinicBrand ? `/clinics/${profile.clinicBrand.slug}` : "/clinics"}>{profile.clinicBrand ? "Our clinic" : "Find a clinic"}</Link><Link className={clinicStyles.secondary} href="/login">Partner sign in</Link></div>
    </nav></header>;
  const [clientAccount, partnerSession, services] = await Promise.all([
    getAuthenticatedClient(),
    getPartnerPortalSession(),
    loadPartnerCalendarServices(profile.organizationId, profile.services, profile.id),
  ]);
  const isCurrentPartner = partnerSession?.profile_id === profile.id;
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

  return (
    <MarketingHeaderEmbed
      account={clientAccount ? {
        fullName: clientAccount.fullName,
        email: clientAccount.email,
        photoUrl: clientAccount.profilePhotoUrl,
        photoUpdatedAt: clientAccount.profilePhotoUpdatedAt,
      } : null}
      partnerAccount={partnerSession ? {
        fullName: partnerSession.display_name,
        email: partnerSession.email,
        photoUrl: isCurrentPartner ? profile.profilePhotoUrl : "",
        photoUpdatedAt: "",
        profileHref: `https://partners.mydripnurse.com/${partnerSession.slug}`,
      } : null}
      location="your area"
      phone="321-989-6446"
      websiteUrl="https://mydripnurse.com"
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
