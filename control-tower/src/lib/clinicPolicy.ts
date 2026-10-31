export const CLINIC_TEAM_CACHE_TAG = "clinic-public-team";
import { readRegionalPrices, regionMatches, resolveRegionalPrice, type PricingLocation, type PricingRegion, type RegionalPrice } from '@/lib/regionalPricing';
export const CLINIC_CACHE_TAG = 'mdn-clinics';
export type ClinicRole = 'owner' | 'manager' | 'nurse';
export type ClinicStatus = 'pending' | 'approved' | 'suspended';
export type ClinicPrice = {
    price: number | null;
    regionalPrices: RegionalPrice[];
};
export function canManageClinic(role: ClinicRole) { return role === 'owner' || role === 'manager'; }
export function clinicCovers(coverage: PricingRegion[], location: PricingLocation) { return coverage.some(region => regionMatches(region, location)); }
export function clinicNurseCovers(clinic: PricingRegion[], nurse: PricingRegion[], location: PricingLocation) { return clinicCovers(clinic, location) && clinicCovers(nurse, location); }
export function resolveClinicPrice(base: number, general: RegionalPrice[], clinic: ClinicPrice, location?: PricingLocation | null) {
    const specific = resolveRegionalPrice(clinic.price ?? base, readRegionalPrices(clinic.regionalPrices), location);
    if (specific.regionId)
        return { ...specific, source: `Clinic · ${specific.source}` };
    if (clinic.price !== null)
        return { price: clinic.price, source: 'Clinic default', regionId: null };
    return resolveRegionalPrice(base, general, location);
}
export function brandColor(value: string, fallback: string) { return /^#[a-f0-9]{6}$/i.test(value) ? value : fallback; }
export function brandTextColor(background: string) {
    const rgb = brandColor(background, '#084f5e').slice(1).match(/../g)!.map(c => { const v = parseInt(c, 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}
export const CLINIC_COLLECTION_NOTICE = 'Your clinic collects the remaining balance and any voluntary tip directly from the client. My Drip Nurse does not collect or pay out this balance. Follow your clinic’s collection instructions.';
