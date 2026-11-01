import { CLINIC_CARE_MEMBER_SQL } from '@/lib/clinicPolicy';
import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDbPool } from '@/lib/db';
import { clinicsEnabled } from '@/lib/clinicFeature';
import { CLINIC_CACHE_TAG, CLINIC_TEAM_CACHE_TAG } from '@/lib/clinicPolicy';

export type ClinicPortalBrand = { id: string; name: string; logoUrl: string; primaryColor: string; accentColor: string };
// Called only with the authenticated nurse's profile ID. Cache contains visual settings,
// never sessions, contact information, appointments or permissions.
const readBrand = unstable_cache(async (profileId: string): Promise<ClinicPortalBrand|null> => {
    const {rows}=await getDbPool().query<ClinicPortalBrand>(`select c.id,c.name,c.logo_url as "logoUrl",c.primary_color as "primaryColor",c.accent_color as "accentColor"
        from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id
        join app.partner_profiles p on p.id=m.partner_profile_id and p.organization_id=c.organization_id
        where m.partner_profile_id=$1 and ${CLINIC_CARE_MEMBER_SQL} and m.status='active'
          and m.accepted_at is not null and m.authorized_at is not null and c.status='approved'
        order by c.name,c.id limit 1`,[profileId]);
    return rows[0]||null;
},['clinic-nurse-portal-brand-v1'],{revalidate:300,tags:[CLINIC_CACHE_TAG,CLINIC_TEAM_CACHE_TAG]});
export async function getClinicPortalBrand(profileId:string){return clinicsEnabled()?readBrand(profileId):null;}
