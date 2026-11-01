import MarketingHeaderEmbed, { type MarketingHeaderMenuLink } from '@/components/marketing/MarketingHeaderEmbed';
import { clinicServiceGroups, type ClinicNavigationService } from '@/lib/clinicServiceNavigation';
import { PARTNER_ORIGIN } from '@/lib/clinicDomainPolicy';
import { publicWebsiteAccounts } from '@/lib/publicWebsiteAccounts';

export async function ClinicPublicHeader({ name, slug, logoUrl, home, services, primaryColor, accentColor }: {
    name: string; slug: string; logoUrl: string | null; home: string; services: ClinicNavigationService[]; primaryColor: string; accentColor: string;
}) {
    const accounts = await publicWebsiteAccounts();
    const groups = clinicServiceGroups(services);
    const links = (id: string): MarketingHeaderMenuLink[] => (groups.find(group => group.id === id)?.services || []).map(service => [service.name, `${home}/services/${encodeURIComponent(service.slug)}`, service.imageUrl || undefined]);
    return <MarketingHeaderEmbed {...accounts}
        brand={{ name, logoUrl, primaryColor, accentColor }}
        location="your area" phone="321-989-6446" websiteUrl={home}
        bannerText="Licensed Nurses · Same-Day Appointments · Verified Mobile IV Care"
        showPartnerPortal showDirectory={false} showWeightLoss={false} showContact={false} showPhone={false}
        ivMenuLinks={links('iv-therapy')} nadMenuLinks={links('nad')} vitaminMenuLinks={links('vitamins')}
        additionalNavLinks={[["Our team", `${home}#team`], ["Become a Partner", `${home}/become-a-partner`]]}
        teamLoginHref={`${PARTNER_ORIGIN}/clinic-login/${encodeURIComponent(slug)}`}
        nativeNavigation refreshServiceMedia={false}
    />;
}
