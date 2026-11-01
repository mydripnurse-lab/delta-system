import { brandColor, brandTextColor } from './clinicPolicy';
export const DEFAULT_CLINIC_HERO = '/clinic-assets/wellness-lounge.webp';
export type ClinicWebsiteSettings = { heroImageUrl?: string; primaryColor?: string; secondaryColor?: string };
function luminance(hex: string) {
    const channels = hex.slice(1).match(/../g)!.map(value => { const v = parseInt(value, 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
export function clinicWebsiteBrand(clinic: { primaryColor: string; accentColor: string; websiteSettings?: ClinicWebsiteSettings }) {
    const settings = clinic.websiteSettings || {};
    const first = brandColor(settings.primaryColor || clinic.primaryColor, '#084f5e');
    const second = brandColor(settings.secondaryColor || clinic.accentColor, '#e9f3f7');
    const [primaryColor, accentColor] = luminance(first) <= luminance(second) ? [first, second] : [second, first];
    return { primaryColor, accentColor, ink: brandTextColor(primaryColor), accentInk: brandTextColor(accentColor) };
}
