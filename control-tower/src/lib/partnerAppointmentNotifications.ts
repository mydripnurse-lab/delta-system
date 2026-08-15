import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";
import { getDbPool } from "@/lib/db";
import { createPartnerAppointmentPush } from "@/lib/partnerPushNotifications";

export type NotificationEvent = "created" | "confirmed" | "partner_acknowledged" | "visit_started" | "visit_completed" | "rescheduled" | "reassigned" | "partner_declined";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function splitName(value: unknown) {
  const parts = text(value).split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value); }
  catch { return `$${value.toFixed(2)}`; }
}

function appointmentTime(value: string, timezone: string) {
  try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: timezone }).format(new Date(value)); }
  catch { return value; }
}

function additionalPatients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = item && typeof item === "object" && !Array.isArray(item)
      ? item as Record<string, unknown>
      : {};
    const split = splitName(record.fullName || record.full_name);
    return {
      ...record,
      firstName: text(record.firstName || record.first_name) || split.firstName,
      lastName: text(record.lastName || record.last_name) || split.lastName,
    };
  });
}

export async function sendPartnerAppointmentNotification(appointmentId: string, event: NotificationEvent) {
  try {
    await Promise.all([ensureBookingEngineSchema(), ensureStaffSchema()]);
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "schema_unavailable" };
  }
  if (event === "confirmed" || event === "reassigned") {
    await createPartnerAppointmentPush(
      appointmentId,
      event === "reassigned" ? "appointment_reassigned" : "appointment_confirmation",
    ).catch(() => undefined);
  }
  let result;
  try {
    result = await getDbPool().query<{
    webhook_url: string | null;
    reference: string;
    status: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    county: string;
    state: string;
    postal_code: string;
    service_name: string;
    amount_due_at_visit: string;
    currency: string;
    partner_name: string;
    partner_email: string;
    partner_slug: string;
    customer_name: string;
    customer_email: string;
	    customer_phone: string;
	    metadata: unknown;
  }>(
    `select config.partner_notification_webhook_url as webhook_url,
            appointment.public_reference as reference, appointment.status,
            appointment.starts_at::text, appointment.ends_at::text, appointment.timezone,
            appointment.address_line_1, appointment.address_line_2,
            appointment.city, appointment.county, appointment.state, appointment.postal_code,
            service.name as service_name,
            greatest(appointment.service_price - appointment.deposit_amount, 0)::text as amount_due_at_visit,
            appointment.currency, partner.display_name as partner_name,
            partner.email as partner_email, partner.slug as partner_slug,
            customer.full_name as customer_name, customer.email as customer_email,
	            customer.phone as customer_phone, appointment.metadata
       from app.appointments appointment
       join app.services service on service.id = appointment.service_id
       left join app.partner_profiles partner on partner.id = coalesce(
         appointment.partner_profile_id,
         (select nullif(declined.actor_id, '')::uuid
            from app.appointment_events declined
           where declined.appointment_id = appointment.id
             and declined.event_type = 'partner_declined'
             and declined.actor_type = 'partner'
           order by declined.created_at desc
           limit 1)
       )
       join app.booking_customers customer on customer.id = appointment.customer_id
       left join app.staff_form_configs config on config.organization_id = appointment.organization_id
      where appointment.id = $1
      limit 1`,
      [appointmentId],
    );
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "query_failed" };
  }
  const row = result.rows[0];
  const webhookUrl = text(row?.webhook_url);
	  if (!row || !webhookUrl) return { sent: false, reason: "not_configured" as const };
	  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
	    ? row.metadata as Record<string, unknown>
	    : {};
	  const patients = additionalPatients(metadata.additional_patients);
	  const customerName = splitName(row.customer_name);
  const clientReward = metadata.client_reward && typeof metadata.client_reward === "object" && !Array.isArray(metadata.client_reward)
    ? metadata.client_reward as Record<string, unknown>
    : {};
  const estimatedEarnings = Number(row.amount_due_at_visit || 0);
  const platformFunded = clientReward.platformFunded === true;
  const platformFundedPartnerAmount = platformFunded
    ? Number(clientReward.platformFundedPartnerAmount || estimatedEarnings)
    : 0;
  const clientAmountDueAtVisit = platformFunded ? 0 : estimatedEarnings;
  const estimatedEarningsFormatted = money(estimatedEarnings, row.currency);
  const earningsDisplay = `${estimatedEarningsFormatted} + tips`;
  const actionRequired = event === "confirmed" || event === "reassigned";
  const appointmentOfferUrl = `https://partners.mydripnurse.com/partner-portal/appointments?appointment=${encodeURIComponent(appointmentId)}&offer=1`;
  const smsMessage = actionRequired
    ? `My Drip Nurse: New appointment. Earn ${earningsDisplay}. ${row.service_name} · ${appointmentTime(row.starts_at, row.timezone)}. Accept or decline: ${appointmentOfferUrl}`
    : event === "partner_acknowledged" && platformFunded
      ? `My Drip Nurse: This accepted visit is funded by My Drip Nurse. We pay ${money(platformFundedPartnerAmount, row.currency)} after completion; collect $0 from the patient.`
      : "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        event: `partner.appointment.${event}`,
        version: 2,
        source: "my-drip-nurse-booking-engine",
        sentAt: new Date().toISOString(),
	        notificationChannels: ["email", "sms"],
	        firstName: customerName.firstName,
	        lastName: customerName.lastName,
	        patientFirstName: customerName.firstName,
	        patientLastName: customerName.lastName,
	        hasAdditionalPatients: patients.length > 0,
	        additionalPatientsCount: patients.length,
	        additionalPatients: patients,
	        partner: { name: row.partner_name, email: row.partner_email, slug: row.partner_slug },
	        customer: { name: row.customer_name, firstName: customerName.firstName, lastName: customerName.lastName, email: row.customer_email, phone: row.customer_phone },
        actionRequired,
        estimatedEarnings,
        estimatedEarningsFormatted,
        earningsCurrency: row.currency,
        tipsEligible: true,
        tipsIncluded: false,
        earningsDisplay,
        rewardBenefit: text(clientReward.benefit) || "none",
        platformFunded,
        platformFundedPartnerAmount,
        clientAmountDueAtVisit,
        partnerPayoutSource: platformFunded ? "my_drip_nurse" : "patient",
        platformFundingStatus: platformFunded ? text(clientReward.platformFundingStatus) || "owed_after_completion" : "not_applicable",
        appointmentOfferUrl,
        actionUrl: appointmentOfferUrl,
        smsMessage,
        offer: { type: "appointment_offer", actionRequired, estimatedEarnings, estimatedEarningsFormatted, currency: row.currency, tipsEligible: true, tipsIncluded: false, earningsDisplay, actionUrl: appointmentOfferUrl, acceptOrDeclineUrl: appointmentOfferUrl },
        appointment: {
          reference: row.reference,
          status: row.status,
          service: row.service_name,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          timezone: row.timezone,
          address: [row.address_line_1, row.address_line_2, row.city, row.county, row.state, row.postal_code].filter(Boolean).join(", "),
          amountDueAtVisit: Number(row.amount_due_at_visit || 0),
          clientAmountDueAtVisit,
          platformFunded,
          platformFundedPartnerAmount,
          partnerPayoutSource: platformFunded ? "my_drip_nurse" : "patient",
          estimatedEarnings,
          tipsEligible: true,
          tipsIncluded: false,
          earningsDisplay,
          currency: row.currency,
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return { sent: false, reason: `http_${response.status}` as const };
    return { sent: true, status: response.status };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}
