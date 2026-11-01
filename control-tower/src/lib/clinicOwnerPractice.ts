import 'server-only';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { getDbPool } from '@/lib/db';
import { requireClinicManager } from '@/lib/clinicAuth';
import { CLINIC_CACHE_TAG, CLINIC_TEAM_CACHE_TAG } from '@/lib/clinicPolicy';
import { coverageFromIds } from '@/lib/clinics';
import { ensureClinicMemberServices, validateClinicMemberServices } from '@/lib/clinicMemberServices';
import type { PricingRegion } from '@/lib/regionalPricing';

export type OwnerPractice = {
    enabled: boolean; partnerId: string | null; name: string | null; slug: string | null;
    eligible: boolean; coverage: PricingRegion[]; serviceIds: string[];
    hasAvailability: boolean;
};
// The existing professional profile and completed review are authoritative.
const profile = `left join app.partner_profiles p on p.organization_id=c.organization_id and lower(p.email)=m.email
    left join app.staff_applications a on a.id=p.application_id`;
const eligible = `coalesce(a.status in ('completed','completed_with_warnings') and nullif(trim(p.professional_credentials),'') is not null and p.profile_consent_at is not null,false)`;
async function owner(clinicId: string) {
    const actor = await requireClinicManager(clinicId);
    if (actor.role !== 'owner') throw new Error('Only the clinic owner can manage their nursing practice.');
    return actor;
}
export async function getOwnerPractice(clinicId: string): Promise<OwnerPractice> {
    const actor = await owner(clinicId);
    const {rows} = await getDbPool().query<OwnerPractice>(`select
      coalesce(to_jsonb(m)->>'owner_practice_enabled','false')='true' as enabled,
      p.id as "partnerId",p.display_name as name,p.slug,${eligible} as eligible,
      m.coverage,coalesce(m.service_ids,'{}'::uuid[]) as "serviceIds",
      exists(select 1 from app.partner_availability_rules r where r.partner_profile_id=p.id and r.is_active) as "hasAvailability"
      from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id ${profile}
      where c.id=$1 and m.email=$2 and m.role='owner' and m.status='active' and m.accepted_at is not null limit 2`,[clinicId,actor.email]);
    if(rows.length!==1) throw new Error('Contact My Drip Nurse to verify your professional profile.');
    return rows[0];
}
export async function saveOwnerPractice(clinicId: string, raw: unknown) {
    const input=z.object({enabled:z.boolean(),serviceIds:z.array(z.string().uuid()).max(100),coverageIds:z.array(z.string().max(300)).max(500)}).parse(raw);
    const actor=await owner(clinicId);
    if(actor.status!=='approved') throw new Error('Your clinic must be approved first.');
    const coverage=input.enabled?await coverageFromIds(input.coverageIds):[];
    if(input.enabled&&(!coverage.length||!input.serviceIds.length)) throw new Error('Choose your services and coverage before enabling your nursing practice.');
    const db=await getDbPool().connect();
    try {
        await db.query('begin');
        const {rows}=await db.query<{id:string;partnerId:string|null;eligible:boolean}>(`select m.id,p.id as "partnerId",${eligible} as eligible
          from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id ${profile}
          where c.id=$1 and c.status='approved' and m.email=$2 and m.role='owner' and m.status='active' and m.accepted_at is not null for update of m for share of c`,[clinicId,actor.email]);
        if(rows.length!==1) throw new Error('Clinic owner access denied.');
        const membership=rows[0];
        if(input.enabled&&(!membership.partnerId||!membership.eligible)) throw new Error('Complete your nurse application and My Drip Nurse review before receiving appointments.');
        if(membership.partnerId) await db.query('select id from app.partner_profiles where id=$1 for update',[membership.partnerId]);
        if(!input.enabled) {
            const pending=await db.query(`select 1 from app.appointments where clinic_id=$1 and partner_profile_id=$2 and status in ('payment_pending','confirmed','partner_acknowledged','in_progress') limit 1`,[clinicId,membership.partnerId]);
            if(pending.rows.length) throw new Error('Complete or reassign your open clinic appointments before disabling your nursing practice.');
        }
        const services=input.enabled?await validateClinicMemberServices(db,clinicId,input.serviceIds):[];
        await db.query(`update app.clinic_memberships set owner_practice_enabled=$3,
          partner_profile_id=case when $3 then $4::uuid else partner_profile_id end,
          coverage=case when $3 then $5::jsonb else coverage end,
          service_ids=case when $3 then $6::uuid[] else service_ids end,updated_at=now()
          where id=$1 and clinic_id=$2`,[membership.id,clinicId,input.enabled,membership.partnerId,JSON.stringify(coverage),services]);
        if(input.enabled&&membership.partnerId) await ensureClinicMemberServices(db,clinicId,membership.partnerId);
        await db.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,$3,$4)`,[clinicId,actor.email,input.enabled?'owner_practice_enabled':'owner_practice_disabled',membership.id]);
        await db.query('commit');
    } catch(error){await db.query('rollback');throw error;} finally{db.release();}
    revalidateTag(CLINIC_CACHE_TAG,{expire:0});
    revalidateTag(CLINIC_TEAM_CACHE_TAG,{expire:0});
}
