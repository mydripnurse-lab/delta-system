import { readRegionalPrices, regionId, regionMatches, resolveRegionalPrice, stateName, type PricingLocation, type PricingRegion } from './regionalPricing';
import { resolveClinicPrice } from './clinicPolicy';

export type PublicPrice = { price: number; currency: string; regionalPrices?: unknown; clinicPrice?: number | null; clinicRegions?: unknown; partnerOverride?: number | null };
type Coverage = PricingLocation & { placeName?: string; level?: PricingRegion['level'] };
export function pricingCoverage(areas: readonly Coverage[]): PricingRegion[] {
    return areas.map(area => {
        const city = area.city || area.placeName || '', county = area.county || '', state = stateName(area.state);
        const level = area.level || (city ? 'city' : county && county !== state ? 'county' : 'state');
        const region = { level, state, county, city, label: [...new Set([city, county, state].filter(Boolean))].join(', '), urls: [] };
        return { ...region, id: regionId(level, region) };
    }).filter(area => area.state);
}
export function publicPriceChoices(service: PublicPrice, coverage: PricingRegion[]) {
    const rules = [...readRegionalPrices(service.regionalPrices), ...readRegionalPrices(service.clinicRegions)];
    // Only descendants within coverage are added. Ancestor rules resolve at the
    // covered location, never as prices from an area the provider does not serve.
    return [...new Map([...coverage, ...rules.map(r => r.region).filter(r => !coverage.length || coverage.some(c => regionMatches(c, r)))].map(r => [r.id, r])).values()].sort((a, b) => a.label.localeCompare(b.label));
}
export function publicPriceAt(service: PublicPrice, location?: PricingLocation) {
    if (service.clinicPrice !== undefined) return resolveClinicPrice(service.price, readRegionalPrices(service.regionalPrices), { price: service.clinicPrice, regionalPrices: readRegionalPrices(service.clinicRegions) }, location).price;
    return resolveRegionalPrice(service.price, readRegionalPrices(service.regionalPrices), location, service.partnerOverride).price;
}
export function publicPriceSummary(service: PublicPrice, coverage: PricingRegion[], selected?: PricingRegion) {
    // A state/county selection still includes its city exceptions.
    const choices = publicPriceChoices(service, selected ? [selected] : coverage);
    const values = (choices.length ? choices.map(r => publicPriceAt(service, r)) : [publicPriceAt(service)]).filter(Number.isFinite);
    if (!coverage.length && !selected) values.push(publicPriceAt(service));
    const low = Math.min(...values), high = Math.max(...values), variable = low !== high;
    const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: service.currency || 'USD' }).format(low);
    return { low, high, variable, label: `${variable ? 'From ' : ''}${amount}` };
}
export function publicPriceOffer(service: PublicPrice, coverage: PricingRegion[], url: string, outOfStock = false) {
    const price = publicPriceSummary(service, coverage);
    return price.variable
        ? { '@type': 'AggregateOffer', lowPrice: price.low, highPrice: price.high, priceCurrency: service.currency, url }
        : { '@type': 'Offer', price: price.low, priceCurrency: service.currency, url, availability: outOfStock ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' };
}
