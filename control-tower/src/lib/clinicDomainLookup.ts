import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDbPool } from './db';
import { CLINIC_CACHE_TAG } from './clinicPolicy';
import { CLINIC_DOMAIN_CACHE_TAG, clinicDomainsEnabled, normalizeClinicDomain, defaultClinicSite } from './clinicDomainPolicy';

// Shared cached lookup. Public requests never call Vercel, DNS or private clinic tables.
const activeDomains = unstable_cache(async (value: string, byClinic: boolean) => {
    const { rows } = await getDbPool().query<{ clinicId: string; slug: string; hostname: string }>(`select c.id as "clinicId",c.slug,d.hostname from app.clinic_domains d join app.clinics c on c.id=d.clinic_id where d.status='active' and c.status='approved' and c.published and ${byClinic ? 'c.id::text' : 'd.hostname'}=$1 limit 1`, [value]);
    return rows[0] || null;
}, ['clinic-domain-routing-v1'], { revalidate: 300, tags: [CLINIC_DOMAIN_CACHE_TAG, CLINIC_CACHE_TAG] });
export async function clinicByDomain(hostname: string) {
    if (!clinicDomainsEnabled()) return null;
    try { return await activeDomains(normalizeClinicDomain(hostname), false); } catch { return null; }
}
export async function clinicSiteAddress(clinic: { id: string; slug: string }) {
    const domain = clinicDomainsEnabled() ? await activeDomains(clinic.id, true) : null;
    return domain ? { home: `https://${domain.hostname}`, canonicalHome: `https://${domain.hostname}` } : defaultClinicSite(clinic.slug);
}

export async function clinicNurseSiteAddress(profile: { slug: string; clinicBrand?: { id: string; slug: string } | null }) {
    if (profile.clinicBrand) {
        const site = await clinicSiteAddress(profile.clinicBrand);
        if (site.home.startsWith('https://')) return `${site.home}/nurses/${encodeURIComponent(profile.slug)}`;
    }
    return `https://partners.mydripnurse.com/${encodeURIComponent(profile.slug)}`;
}
