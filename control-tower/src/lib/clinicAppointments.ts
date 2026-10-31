import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getDbPool } from '@/lib/db';
import { requireClinicManager } from '@/lib/clinicAuth';
import { clinicNurseCovers } from '@/lib/clinicPolicy';
import type { PricingRegion } from '@/lib/regionalPricing';

export class ClinicAppointmentError extends Error {
    constructor(message: string, public status = 409) { super(message); }
}
export async function requireClinicOperations(clinicId: string) {
    const identity = await requireClinicManager(clinicId);
    if (identity.status !== 'approved') throw new ClinicAppointmentError('Your clinic must be approved to manage appointments.', 403);
    return identity;
}
const projection = `a.id,a.public_reference as reference,a.status,a.starts_at as "startsAt",a.ends_at as "endsAt",a.timezone,
 a.updated_at::text as version,a.partner_profile_id as "nurseId",coalesce(p.display_name,'Unassigned') as "nurseName",
 s.name as "serviceName",c.full_name as "customerName",a.service_price::text as price,a.deposit_amount::text as deposit,a.currency,
 coalesce(a.metadata->'client_reward'->>'platformFunded','false')='true' as "platformFunded"`;
const joins = `join app.services s on s.id=a.service_id join app.booking_customers c on c.id=a.customer_id left join app.partner_profiles p on p.id=a.partner_profile_id`;
export type ClinicCalendarVisit = {
    id: string; reference: string; status: string; startsAt: string; endsAt: string; timezone: string;
    version: string; nurseId: string | null; nurseName: string; serviceName: string; customerName: string;
    price: string; deposit: string; currency: string; platformFunded: boolean;
};
export async function clinicCalendar(clinicId: string, input: { from: string; to: string; nurseId?: string; nurseIds?: string[]; staffMode?: 'all'|'include'|'exclude'; includeUnassigned?: boolean; status?: string; cursorTime?: string; cursorId?: string }) {
    await requireClinicOperations(clinicId);
    const { rows } = await getDbPool().query<ClinicCalendarVisit>(`select ${projection} from app.appointments a ${joins}
      where a.clinic_id=$1 and a.starts_at >= $2::timestamptz and a.starts_at < $3::timestamptz
      and ($4::uuid is null or a.partner_profile_id=$4) and ($5::text is null or a.status=$5)
      and ($6::timestamptz is null or (a.starts_at,a.id)>($6::timestamptz,$7::uuid))
      and ($8::text='all' or (a.partner_profile_id is null and $10::boolean)
        or (a.partner_profile_id is not null and (($8='include' and a.partner_profile_id=any($9::uuid[])) or ($8='exclude' and not(a.partner_profile_id=any($9::uuid[]))))))
      order by a.starts_at,a.id limit 101`, [clinicId,input.from,input.to,input.nurseId || null,input.status || null,input.cursorTime || null,input.cursorId || null,input.staffMode||'all',input.nurseIds||[],input.includeUnassigned??input.staffMode!=='include']);
    const items = rows.slice(0,100), last = items.at(-1);
    return { items, next: rows.length > 100 && last ? { time: last.startsAt, id: last.id } : null };
}
export async function clinicVisit(clinicId: string, id: string) {
    await requireClinicOperations(clinicId);
    const { rows } = await getDbPool().query<ClinicCalendarVisit & { address: string; customerEmail: string; customerPhone: string }>(`select ${projection},
      concat_ws(', ',a.address_line_1,nullif(a.address_line_2,''),a.city,a.state,a.postal_code) as address,
      c.email as "customerEmail",c.phone as "customerPhone" from app.appointments a ${joins} where a.clinic_id=$1 and a.id=$2`, [clinicId,id]);
    if (!rows[0]) throw new ClinicAppointmentError('Appointment not found in this clinic.',404);
    return rows[0];
}
// A keyset-paged staff search also includes former staff who still have clinic visits.
export async function clinicCalendarStaff(clinicId: string, search: string, cursor?: string) {
    await requireClinicOperations(clinicId);
    const { rows } = await getDbPool().query<{ id: string; name: string }>(`select p.id,p.display_name as name from app.partner_profiles p
      where (exists(select 1 from app.clinic_memberships m where m.clinic_id=$1 and m.partner_profile_id=p.id and m.role='nurse')
      or exists(select 1 from app.appointments a where a.clinic_id=$1 and a.partner_profile_id=p.id))
      and strpos(lower(p.display_name),lower($2))>0 and ($3::uuid is null or p.id>$3)
      order by p.id limit 51`, [clinicId,search,cursor || null]);
    return { items: rows.slice(0,50), next: rows.length>50 ? rows[49].id : null };
}
type LockedVisit = { id: string; service_id: string; partner_profile_id: string; state: string; county: string; city: string; starts_at: string; ends_at: string; status: string; version: string; reference: string };
const available = `exists(select 1 from app.partner_service_assignments s where s.partner_profile_id=p.id and s.service_id=$2 and s.status='active')
 and (exists(select 1 from app.partner_availability_rules r where r.partner_profile_id=p.id and r.is_active
   and (r.service_id is null or r.service_id=$2) and r.day_of_week=extract(dow from ($3::timestamptz at time zone r.timezone))::smallint
   and (r.effective_from is null or r.effective_from<=($3::timestamptz at time zone r.timezone)::date)
   and (r.effective_until is null or r.effective_until>=($3::timestamptz at time zone r.timezone)::date)
   and (($3::timestamptz at time zone r.timezone)::date+r.start_time) at time zone r.timezone <= $3::timestamptz
   and (($3::timestamptz at time zone r.timezone)::date+r.end_time) at time zone r.timezone >= $4::timestamptz)
 or exists(select 1 from app.partner_availability_exceptions x where x.partner_profile_id=p.id and x.kind='available'
   and (x.service_id is null or x.service_id=$2) and x.starts_at<=$3 and x.ends_at>=$4))
 and not exists(select 1 from app.partner_availability_exceptions x where x.partner_profile_id=p.id and x.kind='unavailable'
   and (x.service_id is null or x.service_id=$2) and x.starts_at<$4 and x.ends_at>$3)
 and not exists(select 1 from app.appointments booked where booked.partner_profile_id=p.id and booked.id<>$5
   and booked.status in ('payment_pending','confirmed','partner_acknowledged','in_progress')
   and (booked.status<>'payment_pending' or booked.hold_expires_at is null or booked.hold_expires_at>now())
   and booked.starts_at<$4 and booked.ends_at>$3)`;
async function candidates(db: Pick<PoolClient,'query'>, clinicId: string, visit: LockedVisit, search: string, cursor?: string, target?: string) {
    const { rows } = await db.query<{ id: string; name: string; coverage: PricingRegion[]; clinicCoverage: PricingRegion[] }>(`select p.id,p.display_name as name,m.coverage,c.coverage as "clinicCoverage"
      from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id
      join app.partner_profiles p on p.id=m.partner_profile_id and p.organization_id=c.organization_id
      join app.clinic_service_prices prices on prices.clinic_id=c.id and prices.service_id=$2 and prices.enabled and prices.availability_status='active'
      where m.clinic_id=$1 and c.status='approved' and m.role='nurse' and m.status='active' and m.accepted_at is not null and m.authorized_at is not null and (m.service_ids is null or $2::uuid=any(m.service_ids))
      and p.id<>$6 and ($7::uuid is null or p.id=$7) and ($8::uuid is null or p.id>$8) and strpos(lower(p.display_name),lower($9))>0
      and ${available} order by p.id limit 51`, [clinicId,visit.service_id,visit.starts_at,visit.ends_at,visit.id,visit.partner_profile_id,target || null,cursor || null,search]);
    return { items: rows.slice(0,50).filter(r=>clinicNurseCovers(r.clinicCoverage,r.coverage,visit)).map(r=>({id:r.id,name:r.name})), next: rows.length>50 ? rows[49].id : null };
}
async function readVisit(db: Pick<PoolClient,'query'>, clinicId: string, id: string, lock=false) {
    const { rows } = await db.query<LockedVisit>(`select id,service_id,partner_profile_id,state,county,city,starts_at,ends_at,status,updated_at::text as version,public_reference as reference
      from app.appointments where clinic_id=$1 and id=$2 ${lock?'for update':''}`, [clinicId,id]);
    const visit=rows[0];
    if (!visit) throw new ClinicAppointmentError('Appointment not found in this clinic.',404);
    if (!['confirmed','partner_acknowledged'].includes(visit.status) || new Date(visit.starts_at).getTime()<=Date.now())
        throw new ClinicAppointmentError('Only upcoming, paid or funded appointments awaiting a visit can be reassigned.');
    return visit;
}
export async function clinicReassignmentCandidates(clinicId: string, id: string, search: string, cursor?: string) {
    await requireClinicOperations(clinicId);
    const db=getDbPool();
    return candidates(db,clinicId,await readVisit(db,clinicId,id),search,cursor);
}
export async function reassignClinicAppointment(clinicId: string, input: { appointmentId: string; nurseId: string; version: string; reason: string }) {
    const identity=await requireClinicOperations(clinicId), db=await getDbPool().connect();
    try {
        await db.query('begin');
        await db.query("set local lock_timeout='5s'");
        // Lock authorization and clinic settings so a concurrent revocation cannot race the assignment.
        const permission=await db.query(`select m.id from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id
          where c.id=$1 and c.status='approved' and m.email=$2 and m.role in ('owner','manager') and m.status='active' and m.accepted_at is not null for share of c,m`,[clinicId,identity.email]);
        if (!permission.rowCount) throw new ClinicAppointmentError('Clinic access denied.',403);
        const visit=await readVisit(db,clinicId,input.appointmentId,true);
        if (visit.version!==input.version) throw new ClinicAppointmentError('This appointment changed. Refresh it before reassigning.');
        if (visit.partner_profile_id===input.nurseId) throw new ClinicAppointmentError('Choose a different nurse.');
        await db.query(`select m.id from app.clinic_memberships m where m.clinic_id=$1 and m.partner_profile_id=$2 and m.role='nurse' for share`,[clinicId,input.nurseId]);
        await db.query(`select service_id from app.clinic_service_prices where clinic_id=$1 and service_id=$2 for share`,[clinicId,visit.service_id]);
        // Same profile lock used by booking/rescheduling: prevents overlapping appointments across clinics.
        await db.query('select id from app.partner_profiles where id=$1 for update',[input.nurseId]);
        const eligible=await candidates(db,clinicId,visit,'',undefined,input.nurseId);
        if (!eligible.items.length) throw new ClinicAppointmentError('This nurse is no longer eligible or available for this service, location and time.');
        const eventId=randomUUID();
        await db.query(`update app.appointments set partner_profile_id=$2,status='confirmed',partner_decline_reason='',declined_at=null,
          metadata=metadata || $3::jsonb,updated_at=now() where id=$1`,[visit.id,input.nurseId,JSON.stringify({reassignedAt:new Date().toISOString(),reassignedFromPartnerProfileId:visit.partner_profile_id,reassignmentReason:input.reason,clinicReassignmentId:eventId})]);
        await db.query(`insert into app.appointment_events(id,appointment_id,event_type,actor_type,actor_id,payload) values($1,$2,'clinic_reassigned','system',$3,$4::jsonb)`,[eventId,visit.id,identity.email,JSON.stringify({clinicId,fromPartnerProfileId:visit.partner_profile_id,toPartnerProfileId:input.nurseId,reason:input.reason,requiresAcceptance:true})]);
        await db.query(`update app.partner_portal_notifications set read_at=coalesce(read_at,now()) where appointment_id=$1 and partner_profile_id=$2 and read_at is null`,[visit.id,visit.partner_profile_id]);
        const targets=[{id:input.nurseId,type:'appointment_reassigned',title:'New clinic appointment',message:`Your clinic assigned appointment ${visit.reference} to you. Review it and accept or decline.`,url:`/partner-portal/appointments?appointment=${visit.id}&offer=1`,event:'clinic_assignment_offered'},
          {id:visit.partner_profile_id,type:'appointment_assignment_removed',title:'Appointment reassigned',message:`Your clinic reassigned appointment ${visit.reference}. You are no longer assigned to this visit.`,url:'/partner-portal/appointments',event:'clinic_assignment_removed'}];
        for (const target of targets) {
            if (!target.id) continue;
            await db.query(`insert into app.partner_portal_notifications(partner_profile_id,appointment_id,event_key,event_type,title,message,action_url) values($1,$2,$3,$4,$5,$6,$7)`,[target.id,visit.id,`${eventId}:${target.id}`,target.type,target.title,target.message,target.url]);
            // Explicitly held for the next communications phase; no webhook or push request is sent here.
            await db.query(`insert into app.clinic_communication_events(clinic_id,event_key,event_type,payload)
              select $1,$2,$3,jsonb_build_object('externalDeliveryPending',true,'appointmentId',$4::text,
              'nurse',jsonb_build_object('name',p.display_name,'email',p.email,'phone',coalesce(a.phone,'')),
              'message',jsonb_build_object('reference',$5::text),
              'actionUrls',jsonb_build_object('clinic_nurse',$6::text,'clinic',$8::text))
              from app.partner_profiles p left join app.staff_applications a on a.id=p.application_id where p.id=$7`,
              [clinicId,`${eventId}:${target.event}`,target.event,visit.id,visit.reference,`https://partners.mydripnurse.com${target.url}`,target.id,`https://partners.mydripnurse.com/portal/clinics?clinic=${clinicId}&appointment=${visit.id}`]);
        }
        await db.query('commit');
        return { id:visit.id, nurseName:eligible.items[0].name };
    } catch(error) { await db.query('rollback'); throw error; } finally { db.release(); }
}
