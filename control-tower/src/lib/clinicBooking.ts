import { clinicWebsiteBrand, type ClinicWebsiteSettings } from "@/lib/clinicWebsiteBrand";
import { CLINIC_CARE_MEMBER_SQL } from '@/lib/clinicPolicy';
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
        primaryColor: string;
        accentColor: string;
        websiteSettings: ClinicWebsiteSettings;
        general_price: string;
        general_regions: unknown;
        service_id: string;
    }>(`select c.id,c.name,c.coverage,c.primary_color as "primaryColor",c.accent_color as "accentColor",coalesce(to_jsonb(c)->'website_settings','{}'::jsonb) as "websiteSettings",p.price::text,p.regional_prices,s.price::text as general_price,s.source_metadata->'regionalPrices' as general_regions,s.id as service_id from app.clinics c join app.clinic_service_prices p on p.clinic_id=c.id and p.enabled and p.availability_status='active' join app.services s on s.id=p.service_id and s.organization_id=c.organization_id and s.is_active join app.service_calendars cal on cal.service_id=s.id and cal.status='active' where c.id=$1 and c.status='approved' and c.published and cal.public_key=$2 ${client ? 'for share of c,p,s,cal' : ''}`, [clinicId, publicKey]);
    const clinic = rows[0];
    if (!clinic)
        throw new Error('This clinic is not accepting bookings for this service.');
    const members = await db.query<{
        partner_profile_id: string;
        coverage: PricingRegion[];
    }>(`select m.partner_profile_id,m.coverage from app.clinic_memberships m where m.clinic_id=$1 and ${CLINIC_CARE_MEMBER_SQL} and m.status='active' and m.partner_profile_id is not null and m.accepted_at is not null and m.authorized_at is not null and (m.service_ids is null or $2::uuid=any(m.service_ids)) ${client ? 'for share of m' : ''}`, [clinicId, clinic.service_id]);
    const partnerIds = members.rows.filter(m => clinicNurseCovers(clinic.coverage, m.coverage, location)).map(m => m.partner_profile_id);
    const price = resolveClinicPrice(Number(clinic.general_price), readRegionalPrices(clinic.general_regions), { price: clinic.price === null ? null : Number(clinic.price), regionalPrices: readRegionalPrices(clinic.regional_prices) }, location);
    return { id: clinic.id, name: clinic.name, partnerIds, brand: clinicWebsiteBrand(clinic), ...price };
}
export const publicClinicServices = unstable_cache(async (id: string, nurseId?: string) => {
    const { rows } = await getDbPool().query<{
        id: string;
        slug: string;
        name: string;
        availabilityStatus: 'active' | 'out_of_stock';
        imageUrl: string;
        description: string;
        ingredients: string[];
        price: number;
        clinicPrice: number | null;
        regionalPrices: unknown;
        clinicRegions: unknown;
        publicKey: string;
        currency: string;
    }>(`select s.id,s.slug,s.name,case when p.availability_status='out_of_stock' or ($2::uuid is not null and exists(select 1 from app.partner_service_assignments a where a.partner_profile_id=$2 and a.service_id=s.id and a.status='out_of_stock')) then 'out_of_stock' else 'active' end as "availabilityStatus",s.image_url as "imageUrl",s.short_description as description,s.ingredients,s.price::float8 as price,s.currency,p.price::float8 as "clinicPrice",p.regional_prices as "clinicRegions",s.source_metadata->'regionalPrices' as "regionalPrices",cal.public_key as "publicKey" from app.clinic_service_prices p join app.clinics c on c.id=p.clinic_id and c.status='approved' and c.published join app.services s on s.id=p.service_id and s.organization_id=c.organization_id and s.is_active join app.service_calendars cal on cal.service_id=s.id and cal.status='active' where p.clinic_id=$1 and p.enabled and p.availability_status <> 'paused' and ($2::uuid is null or exists(
          select 1 from app.clinic_memberships m join app.partner_service_assignments a on a.partner_profile_id=m.partner_profile_id and a.service_id=s.id and a.status in ('active','out_of_stock')
          where m.clinic_id=c.id and m.partner_profile_id=$2 and ${CLINIC_CARE_MEMBER_SQL} and m.status='active' and m.accepted_at is not null and m.authorized_at is not null
          and (m.service_ids is null or s.id=any(m.service_ids)))) order by s.name limit 100`, [id, nurseId || null]);
    return rows;
}, ['public-clinic-services-v4-nurse-selection'], { revalidate: 300, tags: [CLINIC_CACHE_TAG, CLINIC_TEAM_CACHE_TAG, SERVICE_PRICING_TAG] });
export const publicClinicTeam = unstable_cache(async (id: string) => {
    const { rows } = await getDbPool().query<{
        id: string;
        slug: string;
        name: string;
        photo: string;
        credentials: string;
        publicTitle: string;
        biography: string;
        serviceIds: string[];
        coverage: PricingRegion[];
    }>(`select p.id,p.slug,p.display_name as name,coalesce(p.profile_photo_url,'') as photo,coalesce(p.professional_credentials,'') as credentials,coalesce(p.public_title,'') as "publicTitle",coalesce(p.biography,'') as biography,m.coverage,array(select prices.service_id from app.clinic_service_prices prices
          join app.services s on s.id=prices.service_id and s.organization_id=c.organization_id and s.is_active
          join app.partner_service_assignments a on a.partner_profile_id=p.id and a.service_id=s.id and a.status in ('active','out_of_stock')
          where prices.clinic_id=c.id and prices.enabled and prices.availability_status<>'paused' and (m.service_ids is null or s.id=any(m.service_ids))) as "serviceIds" from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id and c.status='approved' and c.published join app.partner_profiles p on p.id=m.partner_profile_id where m.clinic_id=$1 and m.status='active' and ${CLINIC_CARE_MEMBER_SQL} and m.accepted_at is not null and m.authorized_at is not null and p.profile_consent_at is not null and p.website_status='published' and p.directory_status='published' order by p.display_name limit 100`, [id]);
    return rows;
}, ['public-clinic-team-v5-professional-title'], { revalidate: 300, tags: [CLINIC_CACHE_TAG, CLINIC_TEAM_CACHE_TAG] });
// Existing appointments may be declined even if the clinic stops taking new bookings.
// An unavailable clinic returns no replacements, never independent professionals.
export async function clinicReassignmentPartners(clinicId: string, serviceId: string, location: PricingLocation, client: PoolClient) {
    const { rows } = await client.query<{
        clinic_coverage: PricingRegion[];
        coverage: PricingRegion[];
        partner_profile_id: string;
    }>(`select c.coverage as clinic_coverage,m.coverage,m.partner_profile_id from app.clinics c join app.clinic_service_prices p on p.clinic_id=c.id and p.service_id=$2 and p.enabled and p.availability_status='active' join app.clinic_memberships m on m.clinic_id=c.id and m.status='active' and ${CLINIC_CARE_MEMBER_SQL} where c.id=$1 and c.status='approved' and m.partner_profile_id is not null and m.accepted_at is not null and m.authorized_at is not null and (m.service_ids is null or $2::uuid=any(m.service_ids)) for share of c,p,m`, [clinicId, serviceId]);
    return rows.filter(r => clinicNurseCovers(r.clinic_coverage, r.coverage, location)).map(r => r.partner_profile_id);
}

// One cached, bounded query for sitemap discovery; no per-clinic database fan-out.
export const publicClinicSitemapEntries = unstable_cache(async () => {
    const { rows } = await getDbPool().query<{ slug: string; services: string[] }>(`
      with published as (
        select id,organization_id,slug from app.clinics
        where status='approved' and published=true order by id limit 250
      )
      select c.slug,coalesce(array_agg(distinct s.slug) filter (where s.slug is not null),'{}'::text[]) as services
      from published c
      left join app.clinic_service_prices prices on prices.clinic_id=c.id and prices.enabled and prices.availability_status <> 'paused'
      left join app.services s on s.id=prices.service_id and s.organization_id=c.organization_id
        and s.is_active and exists(select 1 from app.service_calendars cal where cal.service_id=s.id and cal.status='active')
      group by c.id,c.slug order by c.slug`);
    return rows;
}, ['public-clinic-sitemap-v2-availability'], { revalidate: 3600, tags: [CLINIC_CACHE_TAG, CLINIC_TEAM_CACHE_TAG, SERVICE_PRICING_TAG] });
