import catalog from '@/data/pricing-geography.json';
import { regionId, stateName, countyToken, PRICING_STATES, type PricingRegion } from '@/lib/regionalPricing';

// Names only, compiled from resources/statesFiles. Never turn template domains
// into live links or confuse page publication with geographic eligibility.
export function buildPricingGeography(): PricingRegion[] {
    const regions = new Map<string, PricingRegion>();
    const add = (level: PricingRegion['level'], state: string, county = '', city = '') => {
        const label = level === 'state' ? state : [city, county, state].filter(Boolean).join(', ');
        const id = regionId(level, { state, county, city });
        regions.set(id, { id, level, state, county, city, label, urls: [] });
    };
    for (const state of PRICING_STATES) add('state', state);
    for (const [slug, counties] of Object.entries(catalog)) {
        const state = stateName(slug.replaceAll('-', ' '));
        if (!state) continue;
        for (const [rawCounty, rawCities] of counties as [string, string[]][]) {
            const umbrellaPR = state === 'Puerto Rico' && countyToken(rawCounty) === 'puerto rico';
            const county = umbrellaPR ? '' : rawCounty;
            if (county) add('county', state, county);
            for (const city of rawCities) add('city', state, county, city);
        }
    }
    return [...regions.values()];
}
export const PRICING_GEOGRAPHY = buildPricingGeography();
