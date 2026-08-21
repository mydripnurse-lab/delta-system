import { randomBytes } from "node:crypto";

import {
  APPOINTMENT_CANCELLATION_WINDOW_HOURS,
  APPOINTMENT_DEPOSIT_POLICY_URL,
  APPOINTMENT_DEPOSIT_POLICY_VERSION,
} from "@/lib/appointmentDepositPolicy";
import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import type { ClientAccount } from "@/lib/clientPortalAuth";
import { getClientAppointments } from "@/lib/clientPortalData";
import { getDbPool } from "@/lib/db";
import { REFUND_REASON_OPTIONS, type RefundReasonCode } from "@/lib/refundRequestPolicy";

export { REFUND_REASON_OPTIONS } from "@/lib/refundRequestPolicy";
export type { RefundReasonCode } from "@/lib/refundRequestPolicy";
export type RefundPolicyAssessment =
  | "likely_eligible"
  | "manual_review"
  | "outside_standard_window"
  | "already_refunded"
  | "no_payment"
  | "not_eligible";

export type RefundRequestStatus = "submitted" | "under_review" | "approved" | "declined" | "completed" | "cancelled";

export type RefundRequestAppointment = {
  id: string;
  reference: string;
  serviceName: string;
  serviceImageUrl: string;
  startsAt: string;
  timezone: string;
  status: string;
  paymentStatus: string;
  depositAmount: number;
  refundedAmount: number;
  currency: string;
  partnerName: string;
  request: null | {
    reference: string;
    status: RefundRequestStatus;
    policyAssessment: RefundPolicyAssessment;
    createdAt: string;
  };
};

export type RefundRequestContext = {
  authenticated: boolean;
  account: { fullName: string; email: string; phone: string } | null;
  appointments: RefundRequestAppointment[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return text(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  const digits = text(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `1${digits}` : digits;
}

function requestReference() {
  return `RFD-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function validReason(value: unknown): RefundReasonCode | null {
  const reason = text(value) as RefundReasonCode;
  return REFUND_REASON_OPTIONS.some((item) => item.value === reason) ? reason : null;
}

export function assessRefundPolicy(input: {
  startsAt: string;
  appointmentStatus: string;
  paymentStatus: string;
  depositAmount: number;
  refundedAmount?: number;
  reasonCode: RefundReasonCode;
  now?: Date;
}): { assessment: RefundPolicyAssessment; hoursBeforeStart: number; headline: string; explanation: string } {
  const now = input.now || new Date();
  const startsAt = new Date(input.startsAt);
  const hoursBeforeStart = Number.isFinite(startsAt.getTime())
    ? Math.round(((startsAt.getTime() - now.getTime()) / 3_600_000) * 10) / 10
    : 0;
  const remaining = Math.max(Number(input.depositAmount || 0) - Number(input.refundedAmount || 0), 0);
  if (input.paymentStatus === "refunded" || remaining <= 0 && input.paymentStatus === "partially_refunded") {
    return { assessment: "already_refunded", hoursBeforeStart, headline: "This deposit has already been refunded", explanation: "No additional deposit refund is currently available for this appointment." };
  }
  if (!["paid", "partially_refunded", "processing"].includes(input.paymentStatus) || remaining <= 0) {
    return { assessment: "no_payment", hoursBeforeStart, headline: "No refundable deposit was found", explanation: "We can still review the appointment, but there is no completed deposit payment to return at this time." };
  }
  if (["provider_unavailable", "provider_no_show", "duplicate_charge", "incorrect_charge"].includes(input.reasonCode)) {
    return { assessment: "likely_eligible", hoursBeforeStart, headline: "This request appears eligible for review", explanation: "The reason selected is covered by, or requires verification under, the Appointment & Deposit Policy. Our team will confirm the appointment and payment record." };
  }
  if (input.appointmentStatus === "completed") {
    return { assessment: "manual_review", hoursBeforeStart, headline: "This request needs individual review", explanation: "Completed visits are reviewed individually against the appointment and payment record." };
  }
  if (input.reasonCode === "cancel_24_hours" && hoursBeforeStart >= APPOINTMENT_CANCELLATION_WINDOW_HOURS) {
    return { assessment: "likely_eligible", hoursBeforeStart, headline: "Your timing meets the standard cancellation window", explanation: `This request was submitted at least ${APPOINTMENT_CANCELLATION_WINDOW_HOURS} hours before the scheduled start. Final approval follows record verification.` };
  }
  if (input.reasonCode === "cancel_24_hours") {
    return { assessment: "outside_standard_window", hoursBeforeStart, headline: "This is outside the standard refund window", explanation: `The policy generally requires cancellation at least ${APPOINTMENT_CANCELLATION_WINDOW_HOURS} hours before the visit. You may still submit the request for exceptional-circumstance review.` };
  }
  if (input.reasonCode === "exceptional_circumstance") {
    return { assessment: "manual_review", hoursBeforeStart, headline: "An individual review is required", explanation: "Exceptional circumstances are evaluated individually and do not guarantee a refund." };
  }
  return { assessment: "manual_review", hoursBeforeStart, headline: "Our team will review this request", explanation: "We will compare the request with the appointment, payment, and current Appointment & Deposit Policy." };
}

export async function getRefundRequestContext(account: ClientAccount | null): Promise<RefundRequestContext> {
  await ensureBookingEngineSchema();
  if (!account) return { authenticated: false as const, account: null, appointments: [] as RefundRequestAppointment[] };
  const appointments = await getClientAppointments(account.id);
  const ids = appointments.map((item) => item.id);
  const pool = getDbPool();
  const [requests, payments] = ids.length ? await Promise.all([
    pool.query<{ appointment_id: string; public_reference: string; status: RefundRequestStatus; policy_assessment: RefundPolicyAssessment; created_at: string }>(
      `select distinct on (appointment_id) appointment_id, public_reference, status, policy_assessment, created_at
         from app.appointment_refund_requests
        where appointment_id = any($1::uuid[])
        order by appointment_id, created_at desc`,
      [ids],
    ),
    pool.query<{ appointment_id: string; refunded_amount: string }>(
      `select appointment_id, refunded_amount::text from app.appointment_payments where appointment_id = any($1::uuid[])`,
      [ids],
    ),
  ]) : [{ rows: [] }, { rows: [] }];
  const requestByAppointment = new Map<string, {
    appointment_id: string;
    public_reference: string;
    status: RefundRequestStatus;
    policy_assessment: RefundPolicyAssessment;
    created_at: string;
  }>(requests.rows.map((row) => [row.appointment_id, row]));
  const refundByAppointment = new Map<string, number>(
    payments.rows.map((row) => [row.appointment_id, Number(row.refunded_amount || 0)]),
  );
  return {
    authenticated: true as const,
    account: { fullName: account.fullName, email: account.email, phone: account.phone },
    appointments: appointments
      .filter((item) => ["paid", "partially_refunded", "processing", "refunded"].includes(item.paymentStatus))
      .map<RefundRequestAppointment>((item) => {
        const request = requestByAppointment.get(item.id);
        return {
          id: item.id,
          reference: item.reference,
          serviceName: item.serviceName,
          serviceImageUrl: item.serviceImageUrl,
          startsAt: item.startsAt,
          timezone: item.timezone,
          status: item.status,
          paymentStatus: item.paymentStatus,
          depositAmount: item.depositAmount,
          refundedAmount: refundByAppointment.get(item.id) || 0,
          currency: item.currency,
          partnerName: item.partnerName,
          request: request ? {
            reference: request.public_reference,
            status: request.status,
            policyAssessment: request.policy_assessment,
            createdAt: new Date(request.created_at).toISOString(),
          } : null,
        };
      }),
  };
}

type SubmitRefundRequestInput = {
  account: ClientAccount | null;
  appointmentId?: unknown;
  appointmentReference?: unknown;
  email?: unknown;
  phone?: unknown;
  reasonCode?: unknown;
  details?: unknown;
  sourceUrl?: unknown;
};

export async function submitRefundRequest(input: SubmitRefundRequestInput) {
  await ensureBookingEngineSchema();
  const reasonCode = validReason(input.reasonCode);
  if (!reasonCode) throw new Error("Choose the reason for your request.");
  const details = text(input.details).slice(0, 1000);
  const appointmentId = text(input.appointmentId);
  const appointmentReference = text(input.appointmentReference).toUpperCase();
  const connectedSelection = Boolean(input.account && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(appointmentId));
  const email = normalizeEmail(connectedSelection ? input.account?.email : input.email);
  const phone = normalizePhone(connectedSelection ? input.account?.phone : input.phone);
  if (!connectedSelection && (!appointmentReference || !email || !phone)) {
    throw new Error("Enter the appointment reference, booking email, and booking phone—or sign in to Care.");
  }
  const pool = getDbPool();
  const lookup = await pool.query<{
    id: string; public_reference: string; starts_at: string; status: string; deposit_amount: string; currency: string;
    customer_name: string; customer_email: string; customer_phone: string; normalized_email: string; normalized_phone: string;
    payment_status: string | null; refunded_amount: string | null;
  }>(
    `select appointment.id, appointment.public_reference, appointment.starts_at, appointment.status,
            appointment.deposit_amount::text, appointment.currency,
            customer.full_name as customer_name, customer.email as customer_email, customer.phone as customer_phone,
            customer.normalized_email, customer.normalized_phone,
            payment.status as payment_status, payment.refunded_amount::text
       from app.appointments appointment
       join app.booking_customers customer on customer.id = appointment.customer_id
       left join app.appointment_payments payment on payment.appointment_id = appointment.id
      where ($1::uuid is not null and appointment.id = $1::uuid)
         or ($2::text <> '' and upper(appointment.public_reference) = $2)
      limit 1`,
    [/^[0-9a-f-]{36}$/i.test(appointmentId) ? appointmentId : null, appointmentReference],
  );
  const appointment = lookup.rows[0];
  if (!appointment) throw new Error("We could not match that appointment. Check the reference and booking email.");
  if (connectedSelection && input.account) {
    const accessible = (await getClientAppointments(input.account.id)).some((item) => item.id === appointment.id);
    if (!accessible) throw new Error("This appointment is not connected to your Care account.");
  } else {
    const emailMatches = email && email === normalizeEmail(appointment.normalized_email || appointment.customer_email);
    const phoneMatches = phone && phone === normalizePhone(appointment.normalized_phone || appointment.customer_phone);
    if (!emailMatches || !phoneMatches) {
      throw new Error("We could not match that appointment. Check the reference and booking contact details.");
    }
  }
  const assessment = assessRefundPolicy({
    startsAt: new Date(appointment.starts_at).toISOString(),
    appointmentStatus: appointment.status,
    paymentStatus: appointment.payment_status || "pending",
    depositAmount: Number(appointment.deposit_amount || 0),
    refundedAmount: Number(appointment.refunded_amount || 0),
    reasonCode,
  });
  const publicReference = requestReference();
  const policySnapshot = {
    url: APPOINTMENT_DEPOSIT_POLICY_URL,
    version: APPOINTMENT_DEPOSIT_POLICY_VERSION,
    cancellationWindowHours: APPOINTMENT_CANCELLATION_WINDOW_HOURS,
    assessment: assessment.assessment,
    hoursBeforeStart: assessment.hoursBeforeStart,
  };
  try {
    const inserted = await pool.query<{ id: string; created_at: string }>(
      `insert into app.appointment_refund_requests (
         public_reference, appointment_id, client_account_id, requester_name, requester_email, requester_phone,
         reason_code, details, policy_assessment, policy_version, policy_snapshot, source_url
       ) values ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
       returning id, created_at`,
      [publicReference, appointment.id, connectedSelection ? input.account?.id || null : null, connectedSelection ? input.account?.fullName || appointment.customer_name : appointment.customer_name,
        email || normalizeEmail(appointment.customer_email), phone || normalizePhone(appointment.customer_phone), reasonCode,
        details, assessment.assessment, APPOINTMENT_DEPOSIT_POLICY_VERSION, JSON.stringify(policySnapshot), text(input.sourceUrl).slice(0, 1000)],
    );
    await Promise.all([
      pool.query(
        `insert into app.appointment_refund_request_events (refund_request_id, event_type, actor_type, actor_id, payload)
         values ($1::uuid, 'submitted', 'customer', $2, $3::jsonb)`,
        [inserted.rows[0].id, connectedSelection ? input.account?.id || email : email, JSON.stringify({ reasonCode, policyAssessment: assessment.assessment })],
      ),
      pool.query(
        `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
         values ($1::uuid, 'refund_request_submitted', 'customer', $2, $3::jsonb)`,
        [appointment.id, connectedSelection ? input.account?.id || email : email, JSON.stringify({ requestReference: publicReference, policyAssessment: assessment.assessment })],
      ),
    ]);
    return {
      reference: publicReference,
      appointmentReference: appointment.public_reference,
      status: "submitted" as const,
      policyAssessment: assessment.assessment,
      assessmentHeadline: assessment.headline,
      assessmentExplanation: assessment.explanation,
      policyUrl: APPOINTMENT_DEPOSIT_POLICY_URL,
      createdAt: new Date(inserted.rows[0].created_at).toISOString(),
    };
  } catch (error) {
    if (String((error as { code?: string })?.code) === "23505") {
      throw new Error("A refund request for this appointment is already under review.");
    }
    throw error;
  }
}

export async function listAdminRefundRequests() {
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<{
    id: string; public_reference: string; appointment_id: string; appointment_reference: string; service_name: string;
    appointment_starts_at: string; appointment_status: string; deposit_amount: string; currency: string; payment_status: string | null;
    requester_name: string; requester_email: string; requester_phone: string; reason_code: RefundReasonCode; details: string;
    status: RefundRequestStatus; policy_assessment: RefundPolicyAssessment; created_at: string; resolution_note: string;
  }>(
    `select request.id, request.public_reference, request.appointment_id,
            appointment.public_reference as appointment_reference, service.name as service_name,
            appointment.starts_at as appointment_starts_at, appointment.status as appointment_status,
            appointment.deposit_amount::text, appointment.currency, payment.status as payment_status,
            request.requester_name, request.requester_email, request.requester_phone,
            request.reason_code, request.details, request.status, request.policy_assessment,
            request.created_at, request.resolution_note
       from app.appointment_refund_requests request
       join app.appointments appointment on appointment.id = request.appointment_id
       join app.services service on service.id = appointment.service_id
       left join app.appointment_payments payment on payment.appointment_id = appointment.id
      order by case request.status when 'submitted' then 0 when 'under_review' then 1 else 2 end, request.created_at desc
      limit 500`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    reference: row.public_reference,
    appointmentId: row.appointment_id,
    appointmentReference: row.appointment_reference,
    serviceName: row.service_name,
    appointmentStartsAt: new Date(row.appointment_starts_at).toISOString(),
    appointmentStatus: row.appointment_status,
    depositAmount: Number(row.deposit_amount || 0),
    currency: row.currency,
    paymentStatus: row.payment_status || "pending",
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    requesterPhone: row.requester_phone,
    reasonCode: row.reason_code,
    reasonLabel: REFUND_REASON_OPTIONS.find((item) => item.value === row.reason_code)?.label || "Other",
    details: row.details,
    status: row.status,
    policyAssessment: row.policy_assessment,
    createdAt: new Date(row.created_at).toISOString(),
    resolutionNote: row.resolution_note,
  }));
}

export async function updateRefundRequestReview(input: {
  requestId: string;
  status: Exclude<RefundRequestStatus, "submitted" | "completed">;
  adminUserId: string;
  note?: string;
}) {
  await ensureBookingEngineSchema();
  const note = text(input.note).slice(0, 1000);
  const result = await getDbPool().query<{ id: string; appointment_id: string; public_reference: string }>(
    `update app.appointment_refund_requests
        set status = $2, reviewed_by = $3, reviewed_at = now(), resolution_note = $4, updated_at = now()
      where id = $1::uuid and status not in ('completed', 'cancelled')
      returning id, appointment_id, public_reference`,
    [input.requestId, input.status, input.adminUserId, note],
  );
  if (!result.rows[0]) throw new Error("Refund request not found or already closed.");
  await getDbPool().query(
    `insert into app.appointment_refund_request_events (refund_request_id, event_type, actor_type, actor_id, payload)
     values ($1::uuid, $2, 'admin', $3, $4::jsonb)`,
    [input.requestId, input.status, input.adminUserId, JSON.stringify({ note })],
  );
  return result.rows[0];
}

export async function completeRefundRequest(requestId: string, adminUserId: string, note: string) {
  const result = await getDbPool().query<{ id: string; appointment_id: string; public_reference: string }>(
    `update app.appointment_refund_requests
        set status = 'completed', reviewed_by = $2, reviewed_at = now(), resolution_note = $3, updated_at = now()
      where id = $1::uuid and status not in ('completed', 'cancelled')
      returning id, appointment_id, public_reference`,
    [requestId, adminUserId, text(note).slice(0, 1000)],
  );
  if (!result.rows[0]) throw new Error("Refund request not found or already closed.");
  await getDbPool().query(
    `insert into app.appointment_refund_request_events (refund_request_id, event_type, actor_type, actor_id, payload)
     values ($1::uuid, 'completed', 'admin', $2, $3::jsonb)`,
    [requestId, adminUserId, JSON.stringify({ note: text(note).slice(0, 1000) })],
  );
  return result.rows[0];
}
