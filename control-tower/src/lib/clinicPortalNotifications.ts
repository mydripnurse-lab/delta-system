import 'server-only';
import { getDbPool } from '@/lib/db';
import { requireClinicOperations } from '@/lib/clinicAppointments';
export type ClinicInboxItem = { id: string; eventType: string; createdAt: string; appointmentId: string; reference: string; nurseName: string; serviceName: string; read: boolean };
export async function clinicNotificationFeed(clinicId: string, cursor?: string) {
    const actor=await requireClinicOperations(clinicId), db=getDbPool();
    const [feed,unread]=await Promise.all([
        db.query<ClinicInboxItem>(`select n.id::text,n.event_type as "eventType",n.created_at as "createdAt",a.id as "appointmentId",a.public_reference as reference,
          coalesce(p.display_name,'Unassigned') as "nurseName",s.name as "serviceName",r.notification_id is not null as read
          from app.clinic_portal_notifications n join app.appointments a on a.id=n.appointment_id and a.clinic_id=n.clinic_id
          join app.services s on s.id=a.service_id left join app.partner_profiles p on p.id=a.partner_profile_id
          left join app.clinic_notification_reads r on r.notification_id=n.id and r.email=$2
          where n.clinic_id=$1 and ($3::bigint is null or n.id<$3) order by n.id desc limit 31`,[clinicId,actor.email,cursor || null]),
        db.query<{ count: number }>(`select count(*)::int as count from (
          select n.id from app.clinic_portal_notifications n join app.appointments a on a.id=n.appointment_id and a.clinic_id=n.clinic_id
          where n.clinic_id=$1 and not exists(select 1 from app.clinic_notification_reads r where r.notification_id=n.id and r.email=$2) limit 100
        ) unread`,[clinicId,actor.email]),
    ]);
    return { items:feed.rows.slice(0,30),next:feed.rows.length>30?feed.rows[29].id:null,unread:unread.rows[0].count };
}
export async function readClinicNotifications(clinicId: string, ids: string[]) {
    const actor=await requireClinicOperations(clinicId);
    await getDbPool().query(`insert into app.clinic_notification_reads(notification_id,email)
      select n.id,$2 from app.clinic_portal_notifications n where n.clinic_id=$1 and n.id=any($3::bigint[])
      on conflict do nothing`,[clinicId,actor.email,ids]);
}
