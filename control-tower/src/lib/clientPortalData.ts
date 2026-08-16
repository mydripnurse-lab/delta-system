import { getDbPool } from "@/lib/db";
import { ensureClientPortalSchema, linkVerifiedClientCustomers } from "@/lib/clientPortalAuth";

export type ClientAppointmentSummary = {
  id: string;
  reference: string;
  serviceName: string;
  partnerName: string;
  partnerProfileId: string;
  partnerAccepted: boolean;
  partnerPhotoUrl: string;
  partnerPublicTitle: string;
  partnerCredentials: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  countryCode: string;
  servicePrice: number;
  depositAmount: number;
  currency: string;
  paymentStatus: string;
  referralRewardApplied: boolean;
  rewardBenefit: "none" | "deposit_waiver" | "free_appointment";
  clientAmountDueAtVisit: number;
  accessRole: "primary_patient" | "additional_patient";
  review: { rating: number; comment: string; createdAt: string } | null;
  additionalPatients: Array<{
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
    invitationStatus: "pending" | "claimed" | "revoked" | "not_sent";
  }>;
};

export type ClientServiceSummary = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  ingredients: string[];
  benefits: string[];
  price: number;
  currency: string;
  imageUrl: string;
  imageAlt: string;
  publicKey: string;
  durationMinutes: number;
  availablePartners: number;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function getClientServices(): Promise<ClientServiceSummary[]> {
  await ensureClientPortalSchema();
  const result = await getDbPool().query<{
    id: string;
    slug: string;
    name: string;
    short_description: string;
    ingredients: string[] | null;
    benefits: string[] | null;
    price: string;
    currency: string;
    image_url: string;
    image_alt: string;
    public_key: string;
    duration_minutes: number;
    available_partners: string;
  }>(
    `select service.id, service.slug, service.name, service.short_description,
            service.ingredients, service.benefits, service.price::text, service.currency,
            service.image_url, service.image_alt, calendar.public_key,
            calendar.duration_minutes,
            count(distinct assignment.partner_profile_id)::text as available_partners
       from app.services service
       join app.organizations organization on organization.id = service.organization_id
       join app.service_calendars calendar on calendar.service_id = service.id
       left join app.partner_service_assignments assignment
         on assignment.service_id = service.id and assignment.status = 'active'
      where (lower(organization.slug) = 'my-drip-nurse' or lower(organization.name) = 'my drip nurse')
        and service.is_active = true
        and service.editorial_status <> 'archived'
        and calendar.status = 'active'
      group by service.id, calendar.id
      order by service.name asc`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    ingredients: row.ingredients || [],
    benefits: row.benefits || [],
    price: Number(row.price || 0),
    currency: row.currency,
    imageUrl: row.image_url,
    imageAlt: row.image_alt || `${row.name} mobile wellness service`,
    publicKey: row.public_key,
    durationMinutes: row.duration_minutes,
    availablePartners: Number(row.available_partners || 0),
  }));
}

export async function getClientAppointments(accountId: string): Promise<ClientAppointmentSummary[]> {
  await ensureClientPortalSchema();
  await linkVerifiedClientCustomers(accountId);
  const result = await getDbPool().query<{
    id: string;
    public_reference: string;
    service_name: string;
    partner_name: string | null;
    partner_profile_id: string | null;
    partner_photo_url: string | null;
    partner_public_title: string | null;
    partner_credentials: string | null;
    review_rating: number | null;
    review_comment: string | null;
    review_created_at: string | null;
    starts_at: string;
    ends_at: string;
    timezone: string;
    status: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    county: string;
    state: string;
    postal_code: string;
    country_code: string;
    service_price: string;
    deposit_amount: string;
    currency: string;
    payment_status: string | null;
    referral_reward_applied: boolean;
    reward_benefit: string;
    client_amount_due_at_visit: string;
    access_role: "primary_patient" | "additional_patient";
    viewer_email: string;
    additional_patients: unknown;
    guest_invites: unknown;
  }>(
    `with accessible as (
       select appointment.id as appointment_id, 'primary_patient'::text as access_role
         from app.client_customer_links link
         join app.appointments appointment on appointment.customer_id = link.booking_customer_id
        where link.client_account_id = $1
       union all
       select access.appointment_id, access.access_role
         from app.client_appointment_access access
        where access.client_account_id = $1
     ), appointment_access as (
       select distinct on (appointment_id) appointment_id, access_role
         from accessible
        order by appointment_id, case when access_role = 'primary_patient' then 0 else 1 end
     )
     select appointment.id, appointment.public_reference,
            service.name as service_name,
            nullif(trim(coalesce(profile.display_name, '')), '') as partner_name,
            profile.id::text as partner_profile_id,
            coalesce(
              nullif(trim(coalesce(profile.profile_photo_url, '')), ''),
              case when coalesce(profile.profile_photo_data, '') <> ''
                then '/api/public/partner-profile-photo/' || profile.id::text else '' end
            ) as partner_photo_url,
            nullif(trim(coalesce(profile.public_title, '')), '') as partner_public_title,
            nullif(trim(coalesce(profile.professional_credentials, '')), '') as partner_credentials,
            review.rating as review_rating,
            review.comment as review_comment,
            review.created_at as review_created_at,
            appointment.starts_at, appointment.ends_at, appointment.timezone, appointment.status,
            appointment.address_line_1, appointment.address_line_2,
            appointment.city, appointment.county, appointment.state,
            appointment.postal_code, appointment.country_code,
            appointment.service_price::text, appointment.deposit_amount::text, appointment.currency,
            payment.status as payment_status,
            coalesce(
              (appointment.metadata #>> '{client_reward,applied}')::boolean,
              (appointment.metadata #>> '{referral_reward,applied}')::boolean,
              false
            ) as referral_reward_applied,
            coalesce(
              nullif(appointment.metadata #>> '{client_reward,benefit}', ''),
              case
                when coalesce((appointment.metadata #>> '{referral_reward,applied}')::boolean, false)
                  then 'deposit_waiver'
                else 'none'
              end
            ) as reward_benefit,
            case
              when appointment.metadata #>> '{client_reward,benefit}' = 'free_appointment' then '0'
              else greatest(appointment.service_price - appointment.deposit_amount, 0)::text
            end as client_amount_due_at_visit,
            access.access_role,
            (select normalized_email from app.client_accounts where id = $1) as viewer_email,
            coalesce(appointment.metadata -> 'additional_patients', '[]'::jsonb) as additional_patients,
            coalesce((
              select jsonb_agg(jsonb_build_object(
                'email', invite.email,
                'normalizedEmail', invite.normalized_email,
                'status', invite.status
              ))
                from app.client_appointment_invites invite
               where invite.appointment_id = appointment.id
            ), '[]'::jsonb) as guest_invites
       from appointment_access access
       join app.appointments appointment on appointment.id = access.appointment_id
       join app.services service on service.id = appointment.service_id
       left join app.partner_profiles profile on profile.id = appointment.partner_profile_id
       left join app.appointment_payments payment on payment.appointment_id = appointment.id
       left join app.appointment_reviews review on review.appointment_id = appointment.id
      order by appointment.starts_at desc
      limit 100`,
    [accountId],
  );
  return result.rows.map((row) => {
    const partnerAccepted = ["partner_acknowledged", "in_progress", "completed"].includes(row.status);
    const invites = new Map((Array.isArray(row.guest_invites) ? row.guest_invites : []).map((value) => {
      const item = record(value);
      return [text(item.normalizedEmail || item.email).toLowerCase(), text(item.status)] as const;
    }));
    const additionalPatients = (Array.isArray(row.additional_patients) ? row.additional_patients : []).map((value) => {
      const item = record(value);
      const firstName = text(item.firstName || item.first_name);
      const lastName = text(item.lastName || item.last_name);
      const email = text(item.email).toLowerCase();
      const inviteStatus = invites.get(email);
      const invitationStatus: "pending" | "claimed" | "revoked" | "not_sent" =
        inviteStatus === "pending" || inviteStatus === "claimed" || inviteStatus === "revoked" ? inviteStatus : "not_sent";
      return {
        firstName,
        lastName,
        fullName: text(item.fullName || item.full_name) || [firstName, lastName].filter(Boolean).join(" "),
        email,
        phone: text(item.phone),
        invitationStatus,
      };
    }).filter((patient) => row.access_role === "primary_patient" || patient.email === row.viewer_email);
    return {
    id: row.id,
    reference: row.public_reference,
    serviceName: row.service_name,
    partnerName: partnerAccepted ? row.partner_name || "My Drip Nurse care professional" : "Care team matching in progress",
    partnerProfileId: partnerAccepted ? row.partner_profile_id || "" : "",
    partnerAccepted,
    partnerPhotoUrl: partnerAccepted ? row.partner_photo_url || "" : "",
    partnerPublicTitle: partnerAccepted ? row.partner_public_title || "My Drip Nurse care professional" : "",
    partnerCredentials: partnerAccepted ? row.partner_credentials || "" : "",
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    timezone: row.timezone,
    status: row.status,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    county: row.county,
    state: row.state,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    servicePrice: Number(row.service_price || 0),
    depositAmount: Number(row.deposit_amount || 0),
    currency: row.currency,
    paymentStatus: row.payment_status || "pending",
    referralRewardApplied: row.referral_reward_applied,
    rewardBenefit: row.reward_benefit === "free_appointment"
      ? "free_appointment"
      : row.reward_benefit === "deposit_waiver" ? "deposit_waiver" : "none",
    clientAmountDueAtVisit: Number(row.client_amount_due_at_visit || 0),
    accessRole: row.access_role,
    review: row.review_rating && row.review_created_at ? {
      rating: Number(row.review_rating),
      comment: row.review_comment || "",
      createdAt: new Date(row.review_created_at).toISOString(),
    } : null,
    additionalPatients,
  };
  });
}
