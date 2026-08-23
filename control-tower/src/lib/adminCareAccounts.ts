import { ensureClientPortalSchema } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { stateMatchesScope } from "@/lib/usStateOptions";

export type AdminCareAccountStatus = "active" | "dormant" | "never_signed_in" | "locked";

export type AdminCareAccount = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  authProvider: string;
  emailVerified: boolean;
  profilePhotoUrl: string;
  city: string;
  state: string;
  createdAt: string;
  lastLoginAt: string;
  lockedUntil: string;
  status: AdminCareAccountStatus;
  profileCompletion: number;
  savedAddressCount: number;
  appointmentCount: number;
  upcomingCount: number;
  completedCount: number;
  lifetimeValue: number;
  currency: string;
  lastAppointmentAt: string;
  referralCount: number;
  availableRewardCount: number;
};

export type AdminCareSummary = {
  total: number;
  active30Days: number;
  dormant: number;
  neverSignedIn: number;
  verified: number;
  locked: number;
};

type AccountRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  auth_provider: string;
  email_verified: boolean;
  profile_photo_url: string;
  city: string;
  state: string;
  created_at: string;
  last_login_at: string | null;
  locked_until: string | null;
  saved_address_count: string;
  appointment_count: string;
  upcoming_count: string;
  completed_count: string;
  lifetime_value: string;
  currency: string;
  last_appointment_at: string | null;
  referral_count: string;
  available_reward_count: string;
  profile_fields_complete: string;
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function accountStatus(row: AccountRow): AdminCareAccountStatus {
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) return "locked";
  if (!row.last_login_at) return "never_signed_in";
  if (new Date(row.last_login_at).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000) return "active";
  return "dormant";
}

export async function listAdminCareAccounts(options: { search?: string; status?: string; provider?: string; limit?: number; stateCodes?: string[] } = {}) {
  await ensureClientPortalSchema();
  const pool = getDbPool();
  const search = String(options.search || "").trim();
  const status = String(options.status || "all").trim();
  const provider = String(options.provider || "all").trim();
  const limit = Math.min(500, Math.max(1, number(options.limit) || 250));

  const values: unknown[] = [];
  const filters: string[] = [];
  if (search) {
    values.push(`%${search}%`);
    filters.push(`(account.full_name ilike $${values.length} or account.email ilike $${values.length} or account.phone ilike $${values.length}
      or coalesce(account.preferences #>> '{address,city}', '') ilike $${values.length}
      or coalesce(account.preferences #>> '{address,state}', '') ilike $${values.length})`);
  }
  if (["email", "google", "hybrid"].includes(provider)) {
    values.push(provider);
    filters.push(`account.auth_provider = $${values.length}`);
  }
  if (status === "active") filters.push("account.last_login_at >= now() - interval '30 days' and coalesce(account.locked_until, '-infinity'::timestamptz) <= now()");
  if (status === "dormant") filters.push("account.last_login_at < now() - interval '30 days' and coalesce(account.locked_until, '-infinity'::timestamptz) <= now()");
  if (status === "never_signed_in") filters.push("account.last_login_at is null and coalesce(account.locked_until, '-infinity'::timestamptz) <= now()");
  if (status === "locked") filters.push("account.locked_until > now()");
  if (status === "verified") filters.push("account.email_verified_at is not null");
  values.push(limit);

  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  const [accountsResult, summaryResult] = await Promise.all([
    pool.query<AccountRow>(
      `with accessible_appointments as (
         select link.client_account_id, appointment.id, appointment.status, appointment.starts_at,
                appointment.service_price, appointment.currency, appointment.state
           from app.client_customer_links link
           join app.appointments appointment on appointment.customer_id = link.booking_customer_id
         union
         select access.client_account_id, appointment.id, appointment.status, appointment.starts_at,
                appointment.service_price, appointment.currency, appointment.state
           from app.client_appointment_access access
           join app.appointments appointment on appointment.id = access.appointment_id
       ), appointment_rollup as (
         select client_account_id,
                count(*)::text as appointment_count,
                count(*) filter (where starts_at >= now() and status in ('payment_pending','confirmed','partner_acknowledged','in_progress'))::text as upcoming_count,
                count(*) filter (where status = 'completed')::text as completed_count,
                coalesce(sum(service_price) filter (where status = 'completed'), 0)::text as lifetime_value,
                coalesce(max(currency), 'USD') as currency,
                max(starts_at)::text as last_appointment_at,
                max(state) as appointment_state
           from accessible_appointments
          group by client_account_id
       ), address_rollup as (
         select client_account_id, count(*)::text as saved_address_count
           from app.client_addresses group by client_account_id
       ), referral_rollup as (
         select inviter_account_id as client_account_id, count(*)::text as referral_count
           from app.client_referral_invites where status <> 'cancelled' group by inviter_account_id
       ), reward_rollup as (
         select client_account_id, count(*)::text as available_reward_count
           from (
             select client_account_id from app.client_referral_rewards where status = 'available'
             union all
             select client_account_id from app.client_visit_rewards where status = 'available'
           ) rewards group by client_account_id
       )
       select account.id::text, account.full_name, account.email, account.phone, account.auth_provider,
              (account.email_verified_at is not null) as email_verified,
              coalesce(account.preferences #>> '{identity,profilePhotoUrl}', '') as profile_photo_url,
              coalesce(account.preferences #>> '{address,city}', '') as city,
              coalesce(nullif(account.preferences #>> '{address,state}', ''), appointments.appointment_state, '') as state,
              account.created_at::text, account.last_login_at::text, account.locked_until::text,
              coalesce(addresses.saved_address_count, '0') as saved_address_count,
              coalesce(appointments.appointment_count, '0') as appointment_count,
              coalesce(appointments.upcoming_count, '0') as upcoming_count,
              coalesce(appointments.completed_count, '0') as completed_count,
              coalesce(appointments.lifetime_value, '0') as lifetime_value,
              coalesce(appointments.currency, 'USD') as currency,
              appointments.last_appointment_at,
              coalesce(referrals.referral_count, '0') as referral_count,
              coalesce(rewards.available_reward_count, '0') as available_reward_count,
              ((case when account.full_name <> '' then 1 else 0 end) +
               (case when account.phone <> '' then 1 else 0 end) +
               (case when account.email_verified_at is not null then 1 else 0 end) +
               (case when coalesce(account.preferences ->> 'dateOfBirth', '') <> '' then 1 else 0 end) +
               (case when coalesce(account.preferences #>> '{address,city}', '') <> '' then 1 else 0 end) +
               (case when coalesce(account.preferences #>> '{emergencyContact,phone}', '') <> '' then 1 else 0 end))::text as profile_fields_complete
         from app.client_accounts account
         left join appointment_rollup appointments on appointments.client_account_id = account.id
         left join address_rollup addresses on addresses.client_account_id = account.id
         left join referral_rollup referrals on referrals.client_account_id = account.id
         left join reward_rollup rewards on rewards.client_account_id = account.id
         ${where}
        order by coalesce(account.last_login_at, account.created_at) desc
        limit $${values.length}`,
      values,
    ),
    pool.query<{
      total: string; active_30_days: string; dormant: string; never_signed_in: string; verified: string; locked: string;
    }>(
      `select count(*)::text as total,
              count(*) filter (where last_login_at >= now() - interval '30 days' and coalesce(locked_until, '-infinity'::timestamptz) <= now())::text as active_30_days,
              count(*) filter (where last_login_at < now() - interval '30 days' and coalesce(locked_until, '-infinity'::timestamptz) <= now())::text as dormant,
              count(*) filter (where last_login_at is null and coalesce(locked_until, '-infinity'::timestamptz) <= now())::text as never_signed_in,
              count(*) filter (where email_verified_at is not null)::text as verified,
              count(*) filter (where locked_until > now())::text as locked
         from app.client_accounts`,
    ),
  ]);

  const accounts: AdminCareAccount[] = accountsResult.rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    authProvider: row.auth_provider,
    emailVerified: row.email_verified,
    profilePhotoUrl: row.profile_photo_url,
    city: row.city,
    state: row.state,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || "",
    lockedUntil: row.locked_until || "",
    status: accountStatus(row),
    profileCompletion: Math.round((number(row.profile_fields_complete) / 6) * 100),
    savedAddressCount: number(row.saved_address_count),
    appointmentCount: number(row.appointment_count),
    upcomingCount: number(row.upcoming_count),
    completedCount: number(row.completed_count),
    lifetimeValue: number(row.lifetime_value),
    currency: row.currency,
    lastAppointmentAt: row.last_appointment_at || "",
    referralCount: number(row.referral_count),
    availableRewardCount: number(row.available_reward_count),
  })).filter((account) => !options.stateCodes?.length || stateMatchesScope(account.state, options.stateCodes));
  const summaryRow = summaryResult.rows[0];
  const databaseSummary: AdminCareSummary = {
    total: number(summaryRow?.total),
    active30Days: number(summaryRow?.active_30_days),
    dormant: number(summaryRow?.dormant),
    neverSignedIn: number(summaryRow?.never_signed_in),
    verified: number(summaryRow?.verified),
    locked: number(summaryRow?.locked),
  };
  const summary: AdminCareSummary = options.stateCodes?.length ? {
    total: accounts.length,
    active30Days: accounts.filter((account) => account.status === "active").length,
    dormant: accounts.filter((account) => account.status === "dormant").length,
    neverSignedIn: accounts.filter((account) => account.status === "never_signed_in").length,
    verified: accounts.filter((account) => account.emailVerified).length,
    locked: accounts.filter((account) => account.status === "locked").length,
  } : databaseSummary;
  return { accounts, summary };
}
