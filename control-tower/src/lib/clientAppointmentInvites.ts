import {
  buildAppointmentPatientRecipients,
  normalizePatientEmail,
  normalizePatientPhone,
  patientFanoutFields,
  postPatientFanout,
} from "@/lib/appointmentPatientFanout";
import { ensureClientPortalSchema } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { ghlRoutingFieldsForPayload } from "@/lib/ghlRoutingEnvelope";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";

const INVITATION_EVENT = "customer.appointment.patient_invited";

function value(input: unknown) {
  return String(input ?? "").trim();
}

function formattedAppointmentTime(startsAt: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(startsAt));
  } catch {
    return startsAt;
  }
}

function careAccessUrl(hasAccount: boolean, email: string) {
  const params = new URLSearchParams({ next: "/appointments", invite: "1" });
  if (email) params.set("email", email);
  const path = hasAccount ? "login" : "register";
  return `https://care.mydripnurse.com/${path}?${params.toString()}`;
}

/**
 * Sends no email directly. Each additional patient becomes one compact GHL
 * contact event so GHL can upsert the contact and deliver its own SMS/email.
 */
export async function sendClientAppointmentInvites(appointmentId: string) {
  await Promise.all([ensureClientPortalSchema(), ensureStaffSchema()]);
  const pool = getDbPool();
  const appointmentResult = await pool.query<{
    webhook_url: string | null;
    reference: string;
    service_name: string;
    starts_at: string;
    timezone: string;
    primary_name: string;
    primary_email: string;
    primary_phone: string;
    additional_patients: unknown;
  }>(
    `select config.partner_notification_webhook_url as webhook_url,
            appointment.public_reference as reference,
            service.name as service_name, appointment.starts_at::text, appointment.timezone,
            customer.full_name as primary_name, customer.normalized_email as primary_email,
            customer.normalized_phone as primary_phone,
            coalesce(appointment.metadata -> 'additional_patients', '[]'::jsonb) as additional_patients
       from app.appointments appointment
       join app.services service on service.id = appointment.service_id
       join app.booking_customers customer on customer.id = appointment.customer_id
       left join app.staff_form_configs config on config.organization_id = appointment.organization_id
      where appointment.id = $1
        and appointment.status in ('confirmed', 'partner_acknowledged', 'in_progress', 'completed')
      limit 1`,
    [appointmentId],
  );
  const appointment = appointmentResult.rows[0];
  if (!appointment) return { sent: false, reason: "appointment_not_found" as const };
  const webhookUrl = value(appointment.webhook_url);
  if (!webhookUrl) return { sent: false, reason: "not_configured" as const };

  const primaryEmail = normalizePatientEmail(appointment.primary_email);
  const primaryPhone = normalizePatientPhone(appointment.primary_phone);
  const fanout = buildAppointmentPatientRecipients({
    additionalPatients: appointment.additional_patients,
    includePrimary: false,
  });
  const recipients = fanout.recipients.filter((recipient) => (
    (!recipient.email || recipient.email !== primaryEmail)
    && (!recipient.phone || recipient.phone !== primaryPhone)
  ));
  if (recipients.length === 0) {
    return { sent: true, sentCount: 0, failedCount: 0, reason: "no_additional_patient_contacts" as const };
  }

  const appointmentTime = formattedAppointmentTime(appointment.starts_at, appointment.timezone);
  const pending: Array<{ inviteId: string; payload: Record<string, unknown> }> = [];
  for (const recipient of recipients) {
    const claimed = await pool.query<{ id: string; has_account: boolean }>(
      `with saved as (
         insert into app.client_appointment_invites (
           appointment_id, email, normalized_email, phone, normalized_phone,
           contact_key, full_name, delivery_status, delivery_error
         )
         values ($1, $2, $2, $3, $3, $4, $5, 'processing', '')
         on conflict (appointment_id, contact_key) do update
           set email = excluded.email,
               normalized_email = excluded.normalized_email,
               phone = excluded.phone,
               normalized_phone = excluded.normalized_phone,
               full_name = excluded.full_name,
               delivery_status = 'processing',
               delivery_error = '',
               updated_at = now()
         where app.client_appointment_invites.sent_at is null
           and (
             app.client_appointment_invites.delivery_status <> 'processing'
             or app.client_appointment_invites.updated_at < now() - interval '2 minutes'
           )
         returning id
       )
       select saved.id,
              exists(
                select 1
                  from app.client_accounts account
                 where account.normalized_email = $2
                   and account.email_verified_at is not null
              ) as has_account
         from saved`,
      [appointmentId, recipient.email, recipient.phone, recipient.contactKey, recipient.fullName],
    );
    const invite = claimed.rows[0];
    if (!invite) continue;

    const accessUrl = careAccessUrl(invite.has_account, recipient.email);
    const smsMessage = `My Drip Nurse: ${appointment.primary_name || "A patient"} included you in a ${appointment.service_name} appointment on ${appointmentTime}. View your appointment: ${accessUrl}`;
    const emailSubject = `${appointment.primary_name || "A patient"} included you in a My Drip Nurse appointment`;
    const basePayload = {
      event: INVITATION_EVENT,
      eventType: INVITATION_EVENT,
      eventId: `${INVITATION_EVENT}:${appointmentId}:${recipient.contactKey}`,
      idempotencyKey: `${INVITATION_EVENT}:${appointmentId}:${recipient.contactKey}`,
      version: 1,
      test: false,
      source: "my-drip-nurse-booking-engine",
      occurredAt: new Date().toISOString(),
      ...patientFanoutFields({
        appointmentId,
        event: INVITATION_EVENT,
        recipient,
        recipientCount: recipients.length,
        skippedCount: fanout.skipped + (fanout.recipients.length - recipients.length),
      }),
      appointmentId,
      appointmentReference: appointment.reference,
      serviceName: appointment.service_name,
      appointmentStartsAt: appointment.starts_at,
      appointmentDateTimeFormatted: appointmentTime,
      appointmentTimezone: appointment.timezone,
      primaryPatientFullName: appointment.primary_name,
      careAccessUrl: accessUrl,
      actionUrl: accessUrl,
      emailSubject,
      smsMessage,
      emailTemplateKey: "additional_patient_invitation",
      smsTemplateKey: "additional_patient_invitation",
      requiredGhlActions: [
        "find_or_create_contact",
        "apply_tags",
        "send_sms_if_enabled",
        "send_email_if_enabled",
      ],
      appointment: {
        id: appointmentId,
        publicReference: appointment.reference,
        serviceName: appointment.service_name,
        startsAt: appointment.starts_at,
        timezone: appointment.timezone,
      },
    };
    pending.push({
      inviteId: invite.id,
      payload: {
        ...basePayload,
        ...ghlRoutingFieldsForPayload(INVITATION_EVENT, basePayload),
      },
    });
  }

  if (pending.length === 0) {
    return { sent: true, sentCount: 0, failedCount: 0, reason: "already_delivered_or_processing" as const };
  }
  const delivery = await postPatientFanout({
    webhookUrl,
    event: INVITATION_EVENT,
    payloads: pending.map((item) => item.payload),
  });
  await Promise.all(pending.map((item, index) => {
    const result = delivery.deliveries[index];
    return pool.query(
      `update app.client_appointment_invites
          set sent_at = case when $2::boolean then now() else sent_at end,
              delivery_status = case when $2::boolean then 'sent' else 'failed' end,
              delivery_error = $3,
              updated_at = now()
        where id = $1`,
      [item.inviteId, Boolean(result?.sent), value(result?.reason).slice(0, 500)],
    );
  }));
  return delivery;
}
