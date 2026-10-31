import { PRICING_GEOGRAPHY } from '@/lib/pricingGeography';
import { stateName } from '@/lib/regionalPricing';

// Names only, from the checked-in US/PR catalog. No active-page filter or DB reads.
const regions = PRICING_GEOGRAPHY;
const byId = new Map(regions.map(region => [region.id, region]));
export function clinicRegistrationCoverage(locationId: string, coverageIds: string[]) {
    const location = byId.get(locationId);
    if (!location || location.level !== 'city') throw new Error('Choose a city or municipality from the location list.');
    // The initial primary operating city is first and always part of coverage.
    const ids = [...new Set([locationId, ...coverageIds])];
    if (ids.length > 500) throw new Error('Select up to 500 areas. Choose an entire state or county to cover its cities.');
    return ids.map(id => {
        const region = byId.get(id);
        if (!region) throw new Error('Choose service areas from the location list.');
        return region;
    });
}
export function clinicRegistrationLocations(state: string) {
    const canonicalState = state ? stateName(state) : '';
    if (state && !canonicalState) throw new Error('Choose a valid state or territory.');
    return regions.filter(region => region.level === 'state' || region.state === canonicalState);
}
