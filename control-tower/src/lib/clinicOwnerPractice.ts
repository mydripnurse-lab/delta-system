import 'server-only';
import { randomBytes } from 'node:crypto';
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
    hasAvailability: boolean; credentials: string; phone: string; publicProfileConsent: boolean;
};
// An approved clinic authorizes its own care team, including its practicing owner.
const profile = `left join app.partner_profiles p on p.organization_id=c.organization_id and lower(p.email)=m.email
    left join app.staff_applications a on a.id=p.application_id`;
const eligible = `coalesce((a.status in ('completed','completed_with_warnings') or
    (p.clinic_managed and m.partner_profile_id=p.id and m.authorized_at is not null and c.status='approved'))
    and nullif(trim(p.professional_credentials),'') is not null and p.profile_consent_at is not null,false)`;
async function owner(clinicId: string) {
    const actor = await requireClinicManager(clinicId);
    if (actor.role !== 'owner') throw new Error('Only the clinic owner can manage their nursing practice.');
    return actor;
}
export async function getOwnerPractice(clinicId: string): Promise<OwnerPractice> {
    const actor = await owner(clinicId);
    const {rows} = await getDbPool().query<OwnerPractice>(`select
      coalesce(to_jsonb(m)->>'owner_practice_enabled','false')='true' as enabled,
      p.id as "partnerId",coalesce(p.display_name,$3) as name,p.slug,${eligible} as eligible,
      coalesce(p.professional_credentials,'') as credentials,coalesce(a.phone,'') as phone,
      p.profile_consent_at is not null as "publicProfileConsent",
      m.coverage,coalesce(m.service_ids,'{}'::uuid[]) as "serviceIds",
      exists(select 1 from app.partner_availability_rules r where r.partner_profile_id=p.id and r.is_active) as "hasAvailability"
      from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id ${profile}
      where c.id=$1 and m.email=$2 and m.role='owner' and m.status='active' and m.accepted_at is not null limit 2`,[clinicId,actor.email,actor.name]);
    if(rows.length!==1) throw new Error('Contact My Drip Nurse to verify your professional profile.');
    return rows[0];
}
export async function saveOwnerPractice(clinicId: string, raw: unknown) {
    const input=z.object({enabled:z.boolean(),serviceIds:z.array(z.string().uuid()).max(100),coverageIds:z.array(z.string().max(300)).max(500),
        nursingProfile:z.object({name:z.string().trim().min(2).max(120),credentials:z.string().trim().min(1).max(250),
            phone:z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Enter your mobile number with country code.'),
            publicProfileConsent:z.literal(true,{error:'Accept publication of your nursing profile before activating it.'})}).optional()}).parse(raw);
    const actor=await owner(clinicId);
    if(actor.status!=='approved') throw new Error('Your clinic must be approved first.');
    const coverage=input.enabled?await coverageFromIds(input.coverageIds):[];
    if(input.enabled&&(!coverage.length||!input.serviceIds.length)) throw new Error('Choose your services and coverage before enabling your nursing practice.');
    const db=await getDbPool().connect();
    try {
        await db.query('begin');
        await db.query('select pg_advisory_xact_lock(hashtext($1))',[`clinic-identity:${actor.email}`]);
        const {rows}=await db.query<{id:string;organizationId:string;partnerId:string|null;eligible:boolean}>(`select m.id,c.organization_id as "organizationId",p.id as "partnerId",${eligible} as eligible
          from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id ${profile}
          where c.id=$1 and c.status='approved' and m.email=$2 and m.role='owner' and m.status='active' and m.accepted_at is not null for update of m for share of c`,[clinicId,actor.email]);
        if(rows.length!==1) throw new Error('Clinic owner access denied.');
        const membership=rows[0];
        if(input.enabled&&!membership.eligible) {
            const details=input.nursingProfile;
            if(!details) throw new Error('Complete your nursing profile and publication consent to activate your practice.');
            if(!membership.partnerId) {
                const application=await db.query<{id:string}>(`insert into app.staff_applications
                  (organization_id,email,status,first_name,last_name,professional_credentials,phone,request_payload)
                  values($1,$2,'under_review',$3,$4,$5,$6,'{"source":"clinic_owner_practice"}') returning id`,
                  [membership.organizationId,actor.email,details.name.split(' ')[0],details.name.split(' ').slice(1).join(' '),details.credentials,details.phone]);
                const slug=`${details.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'nurse'}-${randomBytes(6).toString('hex')}`;
                const created=await db.query<{id:string}>(`insert into app.partner_profiles
                  (organization_id,application_id,ghl_user_id,email,slug,display_name,professional_credentials,website_status,directory_status,clinic_managed,profile_consent_at)
                  values($1,$2,'',$3,$4,$5,$6,'hidden','hidden',true,now()) returning id`,
                  [membership.organizationId,application.rows[0].id,actor.email,slug,details.name,details.credentials]);
                membership.partnerId=created.rows[0].id;
            } else {
                // Reuse the existing account/profile; do not reset passwords, history or availability.
                await db.query(`update app.partner_profiles set professional_credentials=$2,display_name=$3,
                  profile_consent_at=coalesce(profile_consent_at,now()),clinic_managed=true,updated_at=now() where id=$1`,[membership.partnerId,details.credentials,details.name]);
                await db.query(`update app.staff_applications a set phone=$2,professional_credentials=$3
                  from app.partner_profiles p where p.id=$1 and a.id=p.application_id`,[membership.partnerId,details.phone,details.credentials]);
            }
        }
        if(membership.partnerId) await db.query('select id from app.partner_profiles where id=$1 for update',[membership.partnerId]);
        if(!input.enabled) {
            const pending=await db.query(`select 1 from app.appointments where clinic_id=$1 and partner_profile_id=$2 and status in ('payment_pending','confirmed','partner_acknowledged','in_progress') limit 1`,[clinicId,membership.partnerId]);
            if(pending.rows.length) throw new Error('Complete or reassign your open clinic appointments before disabling your nursing practice.');
        }
        const services=input.enabled?await validateClinicMemberServices(db,clinicId,input.serviceIds):[];
        await db.query(`update app.clinic_memberships set owner_practice_enabled=$3,
          partner_profile_id=case when $3 then $4::uuid else partner_profile_id end,
          coverage=case when $3 then $5::jsonb else coverage end,
          service_ids=case when $3 then $6::uuid[] else service_ids end,
          authorized_at=case when $3 then now() else authorized_at end,
          authorized_by=case when $3 then $7 else authorized_by end,updated_at=now()
          where id=$1 and clinic_id=$2`,[membership.id,clinicId,input.enabled,membership.partnerId,JSON.stringify(coverage),services,actor.email]);
        if(input.enabled&&membership.partnerId) {
            await ensureClinicMemberServices(db,clinicId,membership.partnerId);
            await db.query(`update app.partner_profiles set website_status='published',directory_status='published',updated_at=now()
              where id=$1 and profile_consent_at is not null and (website_status<>'published' or directory_status<>'published')`,[membership.partnerId]);
        }
        await db.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,$3,$4)`,[clinicId,actor.email,input.enabled?'owner_practice_enabled':'owner_practice_disabled',membership.id]);
        await db.query('commit');
    } catch(error){await db.query('rollback');throw error;} finally{db.release();}
    revalidateTag(CLINIC_CACHE_TAG,{expire:0});
    revalidateTag(CLINIC_TEAM_CACHE_TAG,{expire:0});
}
