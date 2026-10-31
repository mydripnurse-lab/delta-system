import 'server-only';
import type { PoolClient } from 'pg';
import { unstable_cache } from 'next/cache';
import { getDbPool } from '@/lib/db';
import { requireClinicBookingsEnabled } from '@/lib/clinicFeature';
import { CLINIC_CACHE_TAG, CLINIC_TEAM_CACHE_TAG, clinicNurseCovers, resolveClinicPrice } from '@/lib/clinicPolicy';
import { SERVICE_PRICING_TAG, readRegionalPrices, type PricingLocation, type PricingRegion } from '@/lib/regionalPricing';
export async function clinicBookingContext(clinicId: string, publicKey: string, location: PricingLocation, client?: PoolClient) {
    requireClinicBookingsEnabled();
    const db = client || getDbPool();
    const { rows } = await db.query<{
        id: string;
        name: string;
        coverage: PricingRegion[];
        price: string | null;
        regional_prices: unknown;
        general_price: string;
        general_regions: unknown;
        service_id: string;
    }>(`select c.id,c.name,c.coverage,p.price::text,p.regional_prices,s.price::text as general_price,s.source_metadata->'regionalPrices' as general_regions,s.id as service_id from app.clinics c join app.clinic_service_prices p on p.clinic_id=c.id and p.enabled join app.services s on s.id=p.service_id and s.organization_id=c.organization_id and s.is_active join app.service_calendars cal on cal.service_id=s.id and cal.status='active' where c.id=$1 and c.status='approved' and c.published and cal.public_key=$2 ${client ? 'for share of c,p,s,cal' : ''}`, [clinicId, publicKey]);
    const clinic = rows[0];
    if (!clinic)
        throw new Error('This clinic is not accepting bookings for this service.');
    const members = await db.query<{
        partner_profile_id: string;
        coverage: PricingRegion[];
    }>(`select m.partner_profile_id,m.coverage from app.clinic_memberships m where m.clinic_id=$1 and m.role='nurse' and m.status='active' and m.partner_profile_id is not null ${client ? 'for share of m' : ''}`, [clinicId]);
    const partnerIds = members.rows.filter(m => clinicNurseCovers(clinic.coverage, m.coverage, location)).map(m => m.partner_profile_id);
    const price = resolveClinicPrice(Number(clinic.general_price), readRegionalPrices(clinic.general_regions), { price: clinic.price === null ? null : Number(clinic.price), regionalPrices: readRegionalPrices(clinic.regional_prices) }, location);
    return { id: clinic.id, name: clinic.name, partnerIds, ...price };
}
export const publicClinicServices = unstable_cache(async (id: string) => {
    const { rows } = await getDbPool().query<{
        id: string;
        slug: string;
        name: string;
        imageUrl: string;
        description: string;
        price: number;
        clinicPrice: number | null;
        regionalPrices: unknown;
        clinicRegions: unknown;
        publicKey: string;
        currency: string;
    }>(`select s.id,s.slug,s.name,s.image_url as "imageUrl",s.short_description as description,s.price::float8 as price,s.currency,p.price::float8 as "clinicPrice",p.regional_prices as "clinicRegions",s.source_metadata->'regionalPrices' as "regionalPrices",cal.public_key as "publicKey" from app.clinic_service_prices p join app.clinics c on c.id=p.clinic_id and c.status='approved' and c.published join app.services s on s.id=p.service_id and s.organization_id=c.organization_id and s.is_active join app.service_calendars cal on cal.service_id=s.id and cal.status='active' where p.clinic_id=$1 and p.enabled order by s.name limit 100`, [id]);
    return rows;
}, ['public-clinic-services-v1'], { revalidate: 300, tags: [CLINIC_CACHE_TAG, SERVICE_PRICING_TAG] });
export const publicClinicTeam = unstable_cache(async (id: string) => {
    const { rows } = await getDbPool().query<{
        id: string;
        slug: string;
        name: string;
        photo: string;
        credentials: string;
        biography: string;
        coverage: PricingRegion[];
    }>(`select p.id,p.slug,p.display_name as name,coalesce(p.profile_photo_url,'') as photo,coalesce(p.professional_credentials,'') as credentials,coalesce(p.biography,'') as biography,m.coverage from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id and c.status='approved' and c.published join app.partner_profiles p on p.id=m.partner_profile_id where m.clinic_id=$1 and m.status='active' and m.role='nurse' and p.profile_consent_at is not null order by p.display_name limit 100`, [id]);
    return rows;
}, ['public-clinic-team-v2'], { revalidate: 300, tags: [CLINIC_CACHE_TAG, CLINIC_TEAM_CACHE_TAG] });
// Existing appointments may be declined even if the clinic stops taking new bookings.
// An unavailable clinic returns no replacements, never independent professionals.
export async function clinicReassignmentPartners(clinicId: string, serviceId: string, location: PricingLocation, client: PoolClient) {
    const { rows } = await client.query<{
        clinic_coverage: PricingRegion[];
        coverage: PricingRegion[];
        partner_profile_id: string;
    }>(`select c.coverage as clinic_coverage,m.coverage,m.partner_profile_id from app.clinics c join app.clinic_service_prices p on p.clinic_id=c.id and p.service_id=$2 and p.enabled join app.clinic_memberships m on m.clinic_id=c.id and m.status='active' and m.role='nurse' where c.id=$1 and c.status='approved' and m.partner_profile_id is not null for share of c,p,m`, [clinicId, serviceId]);
    return rows.filter(r => clinicNurseCovers(r.clinic_coverage, r.coverage, location)).map(r => r.partner_profile_id);
}
