import 'server-only';
import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { getDbPool } from '@/lib/db';
import { clinicsEnabled } from '@/lib/clinicFeature';
import { clinicCommunicationContent, clinicCommunicationEvents, clinicRolesForEvent, type ClinicCommunicationRole, type ClinicMessageData } from '@/lib/clinicCommunicationContent';
export const clinicCommunicationsEnabled = () => clinicsEnabled() && process.env.CLINIC_COMMUNICATIONS_ENABLED === 'true';
export function clinicWebhookUrl(raw: unknown) {
    if (!raw) return '';
    const url = new URL(String(raw));
    if (url.username || url.password || url.port || url.search || url.hash || url.protocol !== 'https:' || !['services.leadconnectorhq.com', 'services.msgsndr.com'].includes(url.hostname) || !url.pathname.startsWith('/hooks/')) throw new Error('Use a GHL inbound webhook URL.');
    return url.toString();
}
const eventRoles = JSON.stringify(Object.fromEntries(clinicCommunicationEvents.map(event => [event, clinicRolesForEvent(event)])));
// Set once when enabling production delivery. Never replay historical lifecycle
// changes just because a clinic is edited after the feature is turned on.
function deliveryStart() {
    const value = process.env.CLINIC_COMMUNICATIONS_START_AT;
    if (!value && !clinicCommunicationsEnabled()) return new Date(0).toISOString();
    if (!value || !Number.isFinite(Date.parse(value))) throw new Error('Set a valid clinic communications start time before enabling delivery.');
    return new Date(value).toISOString();
}
type Contact = { name: string; email: string; phone: string };
type EventPayload = { message?: Partial<ClinicMessageData>; nurse?: Contact; client?: Contact; actionUrls?: Partial<Record<ClinicCommunicationRole,string>> };
export async function queueClinicAppointment(input: { clinicId: string; key: string; event: string; message: Partial<ClinicMessageData>; nurse?: Contact; client?: Contact }) {
    await getDbPool().query(`insert into app.clinic_communication_events(clinic_id,event_key,event_type,payload) values($1,$2,$3,$4::jsonb) on conflict(event_key) do nothing`, [input.clinicId, input.key, input.event, JSON.stringify({ message: input.message, nurse: input.nurse, client: input.client })]);
    return deliverClinicCommunications(input.clinicId, input.key);
}
export function scheduleClinicCommunications(clinicId: string) {
    if (!clinicCommunicationsEnabled()) return;
    after(async () => { try { await deliverClinicCommunications(clinicId); } catch { console.error('Clinic communication delivery requires review', { clinicId }); } });
}
export async function deliverClinicCommunications(clinicId: string, key = '') {
    const db = getDbPool();
    const { rows: events } = await db.query<{
        id: string; event_type: string; event_key: string; payload: EventPayload; name: string;
        contact_email: string; contact_phone: string; routes: Partial<Record<ClinicCommunicationRole, string>>;
        member_email: string | null; member_phone: string | null; member_name: string | null;
    }>(`select e.id,e.event_type,e.event_key,e.payload,c.name,c.contact_email,c.contact_phone,
        cfg.clinic_communication_routes as routes,m.email as member_email,application.phone as member_phone,p.display_name as member_name
        from app.clinic_communication_events e join app.clinics c on c.id=e.clinic_id
        left join app.staff_form_configs cfg on cfg.organization_id=c.organization_id
        left join app.clinic_memberships m on m.clinic_id=c.id and m.id::text=e.subject_id
        left join app.partner_profiles p on p.id=m.partner_profile_id
        left join app.staff_applications application on application.id=p.application_id
        where e.clinic_id=$1 and ($2='' or e.event_key=$2) and e.created_at>now()-interval '7 days'
        and e.created_at >= $4::timestamptz
        and e.dispatched_at is null
        and coalesce(e.payload->>'externalDeliveryPending','false') <> 'true'
        and ($2<>'' or exists (
          select 1 from jsonb_array_elements_text($3::jsonb->e.event_type) expected(role)
          left join app.clinic_communication_deliveries delivery on delivery.event_id=e.id and delivery.role=expected.role
          where nullif(cfg.clinic_communication_routes->>expected.role,'') is not null
          and (delivery.id is null or delivery.status in ('pending','not_configured'))
        ))
        order by e.created_at asc limit 20`, [clinicId, key, eventRoles, deliveryStart()]);
    let sent = 0, pending = 0;
    for (const event of events) {
        const roles = clinicRolesForEvent(event.event_type);
        let incomplete = false;
        for (const role of roles) {
            const target = role === 'clinic' ? { name: event.name, email: event.contact_email, phone: event.contact_phone }
                : role === 'clinic_client' ? event.payload.client : event.payload.nurse || (event.member_email ? { name: event.member_name || '', email: event.member_email, phone: event.member_phone || '' } : undefined);
            await db.query(`insert into app.clinic_communication_deliveries(event_id,role) values($1,$2) on conflict(event_id,role) do nothing`, [event.id, role]);
            // Both fields are required by the GHL contact identity guard. Never send to a
            // stale contact when one of the portal's recipient fields is missing.
            if (!target?.email || !target?.phone) {
                await db.query(`update app.clinic_communication_deliveries set status='failed',updated_at=now() where event_id=$1 and role=$2 and status in ('pending','not_configured')`, [event.id, role]);
                incomplete = true; pending++; continue;
            }
            const endpoint = event.routes?.[role];
            if (!endpoint) {
                await db.query(`update app.clinic_communication_deliveries set status='not_configured',updated_at=now() where event_id=$1 and role=$2 and status='pending'`, [event.id, role]);
                pending++; incomplete = true; continue;
            }
            const { rows: reserved } = await db.query<{ id: string }>(`update app.clinic_communication_deliveries set status='sending',attempts=attempts+1,updated_at=now() where event_id=$1 and role=$2 and status in ('pending','not_configured') returning id`, [event.id, role]);
            if (!reserved[0]) {
                const state = await db.query<{ status: string }>('select status from app.clinic_communication_deliveries where event_id=$1 and role=$2', [event.id, role]);
                if (state.rows[0]?.status !== 'sent') { incomplete = true; pending++; }
                continue;
            }
            const content = clinicCommunicationContent({ ...event.payload.message, ...(event.payload.actionUrls?.[role] ? {actionUrl:event.payload.actionUrls[role]} : {}), memberName: event.member_name || undefined, event: event.event_type, role, clinicName: event.name });
            const payload = { ...content, event: event.event_type, recipientRole: role, recipientName: target.name, recipientEmail: target.email, recipientPhone: target.phone, email: target.email, phone: target.phone, name: target.name, clinicName: event.name, idempotencyKey: `${event.event_key}:${role}`, test: false, notifyInternal: role === 'clinic', notificationChannels: ['email','sms'] };
            try {
                const response = await fetch(clinicWebhookUrl(endpoint), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mdn-idempotency-key': payload.idempotencyKey }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000), cache: 'no-store', redirect: 'error' });
                await response.body?.cancel();
                await db.query(`update app.clinic_communication_deliveries set status=$2,http_status=$3,updated_at=now() where id=$1`, [reserved[0].id, response.ok ? 'sent' : 'failed', response.status]);
                if (response.ok) sent++; else { pending++; incomplete = true; }
            } catch {
                // Ambiguous delivery must be reconciled manually; automatic retry may duplicate paid sends.
                await db.query(`update app.clinic_communication_deliveries set status='failed',updated_at=now() where id=$1`, [reserved[0].id]);
                pending++; incomplete = true;
            }
        }
        if (!incomplete) await db.query(`update app.clinic_communication_events set dispatched_at=now() where id=$1`, [event.id]);
    }
    // A successful POST means GHL accepted the event, not delivery to a mailbox/device.
    return { sent: sent > 0, accepted: sent, pending };
}
export async function testClinicCommunication(organizationId: string, role: ClinicCommunicationRole) {
    const db = getDbPool();
    const { rows } = await db.query<{ routes: Partial<Record<ClinicCommunicationRole,string>>; name: string; email: string; phone: string }>(`select cfg.clinic_communication_routes as routes,p.display_name as name,p.email,application.phone from app.staff_form_configs cfg join app.partner_profiles p on p.organization_id=cfg.organization_id left join app.staff_applications application on application.id=p.application_id where cfg.organization_id=$1 and lower(p.email)='mydripnurse@gmail.com' and lower(p.display_name) like '%keishla%' limit 1`, [organizationId]);
    const test = rows[0];
    if (!test?.email) throw new Error('Keishla’s verified test profile was not found. No test was sent.');
    const endpoint = clinicWebhookUrl(test.routes?.[role]);
    if (!endpoint) throw new Error('Configure this clinic workflow first.');
    const content = clinicCommunicationContent({ event: 'new_booking', role, clinicName: 'MDN Test Clinic — No real appointment', serviceName: 'Sample service', reference: 'TEST-ONLY', dateTime: 'Fictitious appointment — do not attend', balance: '$0.00', collectionInstructions: 'TEST ONLY. No payment is due and no appointment has been created.' });
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ ...content, subject: `[TEST] ${content.subject}`, email: test.email, phone: test.phone, name: test.name, recipientEmail: test.email, recipientPhone: test.phone, recipientName: test.name, recipientRole: role, event: 'new_booking', test: true, notifyInternal: false, idempotencyKey: `test:${randomUUID()}` }), signal: AbortSignal.timeout(10000), redirect: 'error' });
    await response.body?.cancel();
    return { ok: response.ok, sent: response.ok, status: response.status, httpStatus: response.status, message: response.ok ? 'Test accepted by GHL for Keishla only. Verify email and SMS delivery in GHL.' : 'GHL rejected the test.' };
}
