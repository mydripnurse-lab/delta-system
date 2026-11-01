import { cache } from 'react';
import { publicClinicServices } from '@/lib/clinicBooking';
import { clinicCovers } from '@/lib/clinicPolicy';
import { definitionForCalendar, partnerServiceSlug, type MyDripNurseServiceWithPrice } from '@/lib/myDripNurseServices';
import { publicPriceSummary } from '@/lib/publicServicePricing';
import type { PublicPartnerProfile } from '@/lib/partnerProfiles';
import type { PricingRegion } from '@/lib/regionalPricing';

export function clinicNurseService(service: Awaited<ReturnType<typeof publicClinicServices>>[number], coverage: PricingRegion[]): MyDripNurseServiceWithPrice {
    const definition = definitionForCalendar(service.name);
    const pricing = { price: service.price, currency: service.currency, regionalPrices: service.regionalPrices,
        clinicPrice: service.clinicPrice, clinicRegions: service.clinicRegions };
    return {
        id: definition?.id || service.slug, name: service.name, imageUrl: service.imageUrl,
        landingPath: `/${definition ? partnerServiceSlug(definition) : service.slug}`,
        priceKey: definition?.priceKey || service.slug, priceAliases: definition?.priceAliases || [],
        ingredients: service.ingredients, description: service.description,
        price: publicPriceSummary(pricing, coverage).label, priceUpdatedAt: '', pricing,
        calendarId: service.publicKey, availabilityStatus: service.availabilityStatus,
    };
}

// The public profile already validates membership and supplies its cached coverage.
// Reuse the nurse-filtered catalog without loading the entire clinic team again.
export const loadClinicNurseCatalog = cache(async (profile: PublicPartnerProfile) => {
    const affiliation = profile.clinicBrand;
    if (!affiliation) return null;
    const nurseCoverage = affiliation.coverage || [];
    const clinicCoverage = affiliation.clinicCoverage || [];
    const coverage = [...new Map([
        ...nurseCoverage.filter(r => clinicCovers(clinicCoverage, r)),
        ...clinicCoverage.filter(r => clinicCovers(nurseCoverage, r)),
    ].map(r => [r.id, r])).values()];
    const rows = await publicClinicServices(affiliation.id, profile.id);
    return { coverage, rows, services: rows.map(row => clinicNurseService(row, coverage)) };
});
