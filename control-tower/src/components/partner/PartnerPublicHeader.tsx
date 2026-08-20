import MarketingHeaderEmbed from "@/components/marketing/MarketingHeaderEmbed";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";

type PartnerPublicHeaderProfile = {
  id: string;
  slug: string;
  displayName: string;
  profilePhotoUrl: string;
};

export default async function PartnerPublicHeader({
  profile,
}: {
  profile: PartnerPublicHeaderProfile;
}) {
  const [clientAccount, partnerSession] = await Promise.all([
    getAuthenticatedClient(),
    getPartnerPortalSession(),
  ]);
  const isCurrentPartner = partnerSession?.profile_id === profile.id;

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
      nativeNavigation
    />
  );
}
