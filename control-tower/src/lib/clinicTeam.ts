import 'server-only';
import type { PoolClient } from 'pg';
import { unstable_cache } from 'next/cache';
import { z } from 'zod';
import { getDbPool } from '@/lib/db';
import { requireClinicManager } from '@/lib/clinicAuth';
import { CLINIC_CACHE_TAG, CLINIC_CARE_MEMBER_SQL, CLINIC_MANAGER_SQL, type ClinicRole } from '@/lib/clinicPolicy';
import { invalidateClinics, type ClinicMember } from '@/lib/clinics';
import { getPartnerWeeklyAvailability, savePartnerWeeklyAvailability } from '@/lib/partnerAvailability';
import { scheduleSchema } from '@/lib/partnerAvailabilitySchema';

export type ClinicTeamSummary = {
    id: string; name: string; email: string; role: ClinicRole; status: string;
    canManage: boolean; hasPractice: boolean; publicationReady: boolean;
};
export type ClinicTeamMember = ClinicMember & ClinicTeamSummary & {
    credentials: string; authorizedAt: string | null;
};
const summaryColumns = `m.id,m.email,m.role,m.status,coalesce(nullif(p.display_name,''),a.full_name,m.email) as name,
    ${CLINIC_MANAGER_SQL} as "canManage",${CLINIC_CARE_MEMBER_SQL} as "hasPractice",
    coalesce(p.profile_consent_at is not null and p.website_status='published' and p.directory_status='published' and m.status='active',false) as "publicationReady"`;
const joins = 'from app.clinic_memberships m left join app.partner_profiles p on p.id=m.partner_profile_id left join app.clinic_accounts a on a.email=m.email';
const cachedTeam = unstable_cache(async (clinicId: string, search: string, offset: number) => {
    const { rows } = await getDbPool().query<ClinicTeamSummary>(`select ${summaryColumns} ${joins}
        where m.clinic_id=$1 and ($2='' or strpos(lower(coalesce(p.display_name,a.full_name,'')),$2)>0 or strpos(lower(m.email),$2)>0)
        order by m.created_at desc,m.id limit 26 offset $3`, [clinicId, search, offset]);
    return { items: rows.slice(0,25), hasMore: rows.length > 25 };
}, ['clinic-team-list-v1'], { revalidate: 60, tags: [CLINIC_CACHE_TAG] });
async function approvedManager(clinicId: string) {
    const actor = await requireClinicManager(clinicId);
    if (actor.status !== 'approved') throw new Error('Clinic approval is required.');
    return actor;
}
export async function clinicTeam(clinicId: string, search: string, offset: number) {
    await approvedManager(clinicId);
    return cachedTeam(clinicId, search.trim().toLowerCase().slice(0,120), offset);
}
export async function clinicTeamMember(clinicId: string, memberId: string) {
    await approvedManager(clinicId);
    const { rows } = await getDbPool().query<ClinicTeamMember>(`select ${summaryColumns},
        m.partner_profile_id as "partnerId",m.coverage,m.service_ids as "serviceIds",
        m.accepted_at::text as "acceptedAt",m.authorized_at::text as "authorizedAt",
        p.slug as "profileSlug",coalesce(p.professional_credentials,'') as credentials
        ${joins} where m.clinic_id=$1 and m.id=$2`, [clinicId, memberId]);
    if (!rows[0]) throw new Error('Team member not found.');
    return rows[0];
}
// Grant/revoke independently from clinical role, services, consent and publication.
export async function setClinicTeamAdmin(clinicId: string, memberId: string, enabled: boolean) {
    const actor = await approvedManager(clinicId);
    if (actor.role !== 'owner') throw new Error('Only the clinic owner can change administrator access.');
    const client = await getDbPool().connect();
    try {
        await client.query('begin');
        const owner = await client.query(`select m.id from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id
            where c.id=$1 and c.status='approved' and m.email=$2 and m.role='owner' and m.status='active'
            and m.accepted_at is not null for share of c,m`, [clinicId,actor.email]);
        if (!owner.rowCount) throw new Error('Clinic owner access required.');
        const result = await client.query<{role:ClinicRole;status:string;accepted_at:string|null;authorized_at:string|null;email:string;can_manage_clinic:boolean}>(
            'select role,status,accepted_at,authorized_at,email,can_manage_clinic from app.clinic_memberships where clinic_id=$1 and id=$2 for update', [clinicId,memberId]);
        const member=result.rows[0];
        if (!member || member.role !== 'nurse' || member.email === actor.email) throw new Error('This member’s administrator access cannot be changed here.');
        if (enabled && (member.status !== 'active' || !member.accepted_at || !member.authorized_at)) throw new Error('Activate this nurse before granting administrator access.');
        if (member.can_manage_clinic !== enabled) {
            await client.query('update app.clinic_memberships set can_manage_clinic=$3,updated_at=now() where clinic_id=$1 and id=$2', [clinicId,memberId,enabled]);
            await client.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,$3,$4)`,[clinicId,actor.email,enabled?'team_admin_granted':'team_admin_revoked',memberId]);
        }
        await client.query('commit');
        invalidateClinics();
    } catch(error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
}
async function scheduleTarget(client: Pick<PoolClient,'query'>, clinicId:string, memberId:string, email:string, lock=false) {
    const access = await client.query(`select m.id from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id
        where c.id=$1 and c.status='approved' and m.email=$2 and m.status='active' and m.accepted_at is not null
        and ${CLINIC_MANAGER_SQL} ${lock?'for share of c,m':''}`, [clinicId,email]);
    if (!access.rowCount) throw new Error('Clinic access denied.');
    const {rows} = await client.query<{partnerId:string}>(`select m.partner_profile_id as "partnerId" from app.clinic_memberships m
        where m.clinic_id=$1 and m.id=$2 and m.status='active' and m.accepted_at is not null and m.authorized_at is not null
        and m.partner_profile_id is not null and ${CLINIC_CARE_MEMBER_SQL} ${lock?'for share of m':''}`, [clinicId,memberId]);
    if (!rows[0]) throw new Error('Activate this nursing profile before editing its availability.');
    return rows[0].partnerId;
}
export async function clinicTeamSchedule(clinicId:string,memberId:string) {
    const actor=await approvedManager(clinicId);
    return getPartnerWeeklyAvailability(await scheduleTarget(getDbPool(),clinicId,memberId,actor.email),true);
}
export async function saveClinicTeamSchedule(clinicId:string,memberId:string,raw:unknown) {
    const {timezone,days}=scheduleSchema.parse(raw);
    const actor=await approvedManager(clinicId);
    const profileId=await scheduleTarget(getDbPool(),clinicId,memberId,actor.email);
    return savePartnerWeeklyAvailability({profileId,timezone,days,schemaReady:true,authorizeWrite:async client=>{
        const current=await scheduleTarget(client,clinicId,memberId,actor.email,true);
        if(current!==profileId)throw new Error('Member profile changed. Reload and try again.');
        await client.query('select id from app.partner_profiles where id=$1 for update',[profileId]);
        await client.query(`insert into app.clinic_audit(clinic_id,actor,action,subject_id) values($1,$2,'team_availability_updated',$3)`,[clinicId,actor.email,memberId]);
    }});
}
export const clinicTeamIds=z.object({clinicId:z.string().uuid(),memberId:z.string().uuid()});
