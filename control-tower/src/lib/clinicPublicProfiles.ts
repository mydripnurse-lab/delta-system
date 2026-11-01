import { CLINIC_CARE_MEMBER_SQL } from '@/lib/clinicPolicy';
import 'server-only';
import { clinicsEnabled } from '@/lib/clinicFeature';
import { unstable_cache } from 'next/cache';
import { getDbPool } from '@/lib/db';
import { CLINIC_CACHE_TAG, CLINIC_TEAM_CACHE_TAG, clinicCovers } from '@/lib/clinicPolicy';
import { SERVICE_PRICING_TAG, type PricingRegion } from '@/lib/regionalPricing';
import type { PublicPartnerProfile } from '@/lib/partnerProfiles';

// One bounded, shared read for all clinic professionals on a directory page.
// Never load invitations, private contacts, credentials or appointment details here.
const affiliations = unstable_cache(async (ids: string[]) => {
    const { rows } = await getDbPool().query<{
        partnerId: string; id: string; slug: string; name: string;
        coverage: PricingRegion[]; clinicCoverage: PricingRegion[];
        services: PublicPartnerProfile['services'];
        logoUrl: string; primaryColor: string; accentColor: string;
    }>(`select m.partner_profile_id as "partnerId",c.id,c.slug,c.name,m.coverage,c.coverage as "clinicCoverage",c.logo_url as "logoUrl",c.primary_color as "primaryColor",c.accent_color as "accentColor",coalesce((select jsonb_agg(jsonb_build_object('calendarId',cal.id,'name',s.name,'status',case when prices.availability_status='out_of_stock' then 'out_of_stock' else a.status end,'price',coalesce(prices.price,s.price)))
          from app.clinic_service_prices prices join app.services s on s.id=prices.service_id and s.organization_id=c.organization_id and s.is_active
          join app.service_calendars cal on cal.service_id=s.id and cal.status='active'
          join app.partner_service_assignments a on a.partner_profile_id=m.partner_profile_id and a.service_id=s.id and a.status in ('active','out_of_stock')
          where prices.clinic_id=c.id and prices.enabled and prices.availability_status<>'paused' and (m.service_ids is null or s.id=any(m.service_ids))),'[]'::jsonb) as services
        from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id
        where m.partner_profile_id=any($1::uuid[]) and ${CLINIC_CARE_MEMBER_SQL} and m.status='active'
        and m.accepted_at is not null and m.authorized_at is not null and c.status='approved' and c.published
        order by c.name,c.id limit 1000`, [ids]);
    return rows;
}, ['clinic-professional-affiliations-v3-services'], { revalidate: 300, tags: [CLINIC_CACHE_TAG, CLINIC_TEAM_CACHE_TAG, SERVICE_PRICING_TAG] });

export async function enrichClinicProfiles(profiles: PublicPartnerProfile[]) {
    const ids = profiles.map(p => p.id).sort();
    if (!ids.length || !clinicsEnabled()) return profiles;
    const rows = await affiliations(ids);
    return profiles.map(profile => {
        const memberships = rows.filter(row => row.partnerId === profile.id);
        if (!memberships.length) return profile;
        const regions = memberships.flatMap(row => [
            ...row.coverage.filter(r => clinicCovers(row.clinicCoverage, r)),
            ...row.clinicCoverage.filter(r => clinicCovers(row.coverage, r)),
        ]);
        const coverage = [...new Map<string, PricingRegion>(regions.map((r: PricingRegion) => [r.id, r])).values()];
        return { ...profile, services: [...new Map<string, PublicPartnerProfile['services'][number]>(memberships.flatMap(m => m.services).map(s => [s.calendarId, s])).values()], clinicBrand: memberships[0],
            clinics: memberships.map(({ id, slug, name }) => ({ id, slug, name })),
            serviceAreas: coverage.map(r => ({ state: r.state, county: r.county || '', city: r.city || '', locationId: '', })),
        };
    });
}
