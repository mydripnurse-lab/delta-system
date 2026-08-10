import { getDbPool } from "@/lib/db";
import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";

const DEFAULT_COMMISSION_RATE = 2;

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export type PartnerAffiliateDashboard = {
  affiliateUrl: string;
  affiliateCode: string;
  globalRate: number;
  commissionRate: number;
  metrics: {
    totalEarned: number;
    pending: number;
    paid: number;
    appointments: number;
    referredPartners: number;
  };
  referredPartners: Array<{
    id: string;
    displayName: string;
    businessName: string;
    websiteStatus: string;
    joinedAt: string;
    appointmentCount: number;
    totalEarned: number;
    pending: number;
    paid: number;
  }>;
  commissions: Array<{
    id: string;
    appointmentId: string;
    reference: string;
    partnerName: string;
    serviceName: string;
    appointmentAt: string;
    amount: number;
    rate: number;
    currency: string;
    status: string;
  }>;
};

export async function recordPartnerAffiliateCommission(appointmentId: string) {
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const result = await pool.query<{
    appointment_id: string;
    referred_profile_id: string;
    referrer_profile_id: string;
    service_id: string;
    service_price: string;
    currency: string;
    global_rate: string | null;
    override_rate: string | null;
  }>(
    `select a.id as appointment_id,
            referred.id as referred_profile_id,
            referrer.id as referrer_profile_id,
            a.service_id,
            a.service_price::text,
            a.currency,
            config.affiliate_commission_rate::text as global_rate,
            referrer.affiliate_commission_rate::text as override_rate
       from app.appointments a
       join app.partner_profiles referred on referred.id = a.partner_profile_id
       join app.staff_applications child_app on child_app.id = referred.application_id
       join app.partner_profiles referrer on referrer.id = child_app.referred_by_profile_id
       left join app.staff_form_configs config on config.organization_id = a.organization_id
      where a.id = $1::uuid
        and a.status in ('confirmed', 'partner_acknowledged', 'in_progress', 'completed')
      limit 1`,
    [appointmentId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const rate = Math.min(100, Math.max(0, number(row.override_rate || row.global_rate || DEFAULT_COMMISSION_RATE)));
  const amount = round(number(row.service_price) * rate / 100);
  const inserted = await pool.query(
    `insert into app.partner_affiliate_commissions
       (referrer_profile_id, referred_profile_id, appointment_id, service_id, amount, rate, currency, status, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8::jsonb)
     on conflict (appointment_id) do nothing
     returning id`,
    [row.referrer_profile_id, row.referred_profile_id, row.appointment_id, row.service_id, amount, rate, row.currency || "USD", JSON.stringify({ source: "appointment_confirmation" })],
  );
  return inserted.rows[0]?.id || null;
}

export async function getPartnerAffiliateDashboard(profileId: string): Promise<PartnerAffiliateDashboard> {
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const profileResult = await pool.query<{
    slug: string;
    affiliate_code: string | null;
    global_rate: string | null;
    override_rate: string | null;
  }>(
    `select p.slug, p.affiliate_code,
            config.affiliate_commission_rate::text as global_rate,
            p.affiliate_commission_rate::text as override_rate
       from app.partner_profiles p
       left join app.staff_form_configs config on config.organization_id = p.organization_id
      where p.id = $1::uuid
      limit 1`,
    [profileId],
  );
  const profile = profileResult.rows[0];
  if (!profile) throw new Error("Partner profile not found.");
  const globalRate = Math.min(100, Math.max(0, number(profile.global_rate || DEFAULT_COMMISSION_RATE)));
  const commissionRate = Math.min(100, Math.max(0, number(profile.override_rate || profile.global_rate || DEFAULT_COMMISSION_RATE)));

  const referred = await pool.query<{
    id: string;
    display_name: string;
    business_name: string;
    website_status: string;
    joined_at: string;
    appointment_count: string;
    total_earned: string;
    pending: string;
    paid: string;
  }>(
    `select child.id, child.display_name, coalesce(child.business_name, '') as business_name,
            child.website_status, coalesce(child.published_at, child.created_at)::text as joined_at,
            count(c.id)::text as appointment_count,
            coalesce(sum(c.amount), 0)::text as total_earned,
            coalesce(sum(c.amount) filter (where c.status <> 'paid' and c.status <> 'void'), 0)::text as pending,
            coalesce(sum(c.amount) filter (where c.status = 'paid'), 0)::text as paid
       from app.partner_profiles child
       join app.staff_applications child_app on child_app.id = child.application_id
       left join app.partner_affiliate_commissions c on c.referred_profile_id = child.id
      where child_app.referred_by_profile_id = $1::uuid
      group by child.id
      order by child.created_at desc`,
    [profileId],
  );

  const commissions = await pool.query<{
    id: string;
    appointment_id: string;
    public_reference: string;
    partner_name: string;
    service_name: string;
    appointment_at: string;
    amount: string;
    rate: string;
    currency: string;
    status: string;
  }>(
    `select c.id, c.appointment_id, a.public_reference,
            referred.display_name as partner_name, service.name as service_name,
            a.starts_at::text as appointment_at, c.amount::text, c.rate::text,
            c.currency, c.status
       from app.partner_affiliate_commissions c
       join app.appointments a on a.id = c.appointment_id
       join app.partner_profiles referred on referred.id = c.referred_profile_id
       join app.services service on service.id = c.service_id
      where c.referrer_profile_id = $1::uuid
      order by c.created_at desc
      limit 100`,
    [profileId],
  );

  const partnerRows = referred.rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    businessName: row.business_name,
    websiteStatus: row.website_status,
    joinedAt: row.joined_at,
    appointmentCount: Math.round(number(row.appointment_count)),
    totalEarned: round(number(row.total_earned)),
    pending: round(number(row.pending)),
    paid: round(number(row.paid)),
  }));
  const commissionRows = commissions.rows.map((row) => ({
    id: row.id,
    appointmentId: row.appointment_id,
    reference: row.public_reference,
    partnerName: row.partner_name,
    serviceName: row.service_name,
    appointmentAt: row.appointment_at,
    amount: round(number(row.amount)),
    rate: number(row.rate),
    currency: row.currency || "USD",
    status: row.status,
  }));
  const totalEarned = round(commissionRows.filter((row) => row.status !== "void").reduce((sum, row) => sum + row.amount, 0));
  const pending = round(commissionRows.filter((row) => !["paid", "void"].includes(row.status)).reduce((sum, row) => sum + row.amount, 0));
  const paid = round(commissionRows.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.amount, 0));
  return {
    affiliateUrl: `https://partners.mydripnurse.com/${profile.slug}/become-a-partner`,
    affiliateCode: profile.affiliate_code || profile.slug,
    globalRate,
    commissionRate,
    metrics: { totalEarned, pending, paid, appointments: commissionRows.length, referredPartners: partnerRows.length },
    referredPartners: partnerRows,
    commissions: commissionRows,
  };
}

export async function getAffiliateCommissionSettingsForApplication(applicationId: string) {
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<{ global_rate: string | null; override_rate: string | null }>(
    `select config.affiliate_commission_rate::text as global_rate,
            p.affiliate_commission_rate::text as override_rate
       from app.staff_applications a
       join app.organizations o on o.id = a.organization_id and o.slug = 'my-drip-nurse'
       left join app.staff_form_configs config on config.organization_id = a.organization_id
       left join app.partner_profiles p on p.application_id = a.id
      where a.id = $1::uuid limit 1`,
    [applicationId],
  );
  const row = result.rows[0];
  return {
    globalRate: number(row?.global_rate || DEFAULT_COMMISSION_RATE),
    overrideRate: row?.override_rate === null || row?.override_rate === undefined ? null : number(row.override_rate),
    effectiveRate: number(row?.override_rate || row?.global_rate || DEFAULT_COMMISSION_RATE),
  };
}

export async function saveAffiliateCommissionOverride(applicationId: string, rate: number | null) {
  await ensureBookingEngineSchema();
  const normalized = rate === null ? null : Math.min(100, Math.max(0, Number(rate)));
  if (normalized !== null && !Number.isFinite(normalized)) throw new Error("Commission rate must be a number from 0 to 100.");
  await getDbPool().query(
    `update app.partner_profiles p
        set affiliate_commission_rate = $2::numeric,
            updated_at = now()
       from app.staff_applications a
      where p.application_id = a.id and a.id = $1::uuid`,
    [applicationId, normalized],
  );
  return getAffiliateCommissionSettingsForApplication(applicationId);
}
