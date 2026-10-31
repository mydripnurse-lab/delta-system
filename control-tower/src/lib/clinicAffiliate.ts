import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDbPool } from '@/lib/db';
import { clinicsEnabled } from '@/lib/clinicFeature';
import { requireClinicManager } from '@/lib/clinicAuth';

/** Attribution is resolved by the server; never accept an applicant-supplied clinic ID. */
export async function resolveClinicReferral(code: string, organizationId: string, email: string): Promise<string | null> {
    if (!clinicsEnabled()) throw new Error('Clinic referrals are not open yet.');
    const slug = code.slice('clinic:'.length);
    if (!code.startsWith('clinic:') || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80)
        throw new Error('Invalid clinic referral link.');
    const { rows } = await getDbPool().query<{ id: string }>(`
      select c.id from app.clinics c
      where c.organization_id=$1 and c.slug=$2 and c.status='approved'
        and not exists (select 1 from app.clinic_memberships m where m.clinic_id=c.id and m.email=$3 and m.status <> 'removed')
        and not exists (select 1 from app.partner_profiles p where p.organization_id=$1 and lower(p.email)=$3)
        and not exists (select 1 from app.staff_applications a where a.organization_id=$1 and lower(a.email)=$3)
      limit 1`, [organizationId, slug, email.trim().toLowerCase()]);
    // Existing accounts/applications retain their original attribution.
    return rows[0]?.id || null;
}

/** Only newly registered, independent clinic owners can acquire attribution. */
export async function resolveNewClinicReferral(client: Pick<import('pg').PoolClient, 'query'>, code: string, organizationId: string, email: string): Promise<string | null> {
    if (!/^clinic:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) || code.length > 87) throw new Error('Invalid clinic referral link.');
    const { rows } = await client.query<{ id: string }>(`
      select c.id from app.clinics c
      where c.organization_id=$1 and c.slug=$2 and c.status='approved' and c.published
        and not exists(select 1 from app.clinic_accounts where email=$3)
        and not exists(select 1 from app.partner_profiles where organization_id=$1 and lower(email)=$3)
        and not exists(select 1 from app.staff_applications where organization_id=$1 and lower(email)=$3)
        and not exists(select 1 from app.clinic_memberships where email=$3 and status <> 'removed')
      limit 1`, [organizationId, code.slice(7), email.trim().toLowerCase()]);
    return rows[0]?.id || null;
}

/** Called only by the existing confirmed-payment automation, never by a page read. */
export async function recordClinicAffiliateCommission(appointmentId: string) {
    if (!clinicsEnabled()) return null;
    const { rows } = await getDbPool().query<{ id: string }>(`
      insert into app.clinic_affiliate_commissions
        (clinic_id,referred_profile_id,referred_clinic_id,appointment_id,service_id,amount,rate,currency)
      select c.id,
        case when booked.referred_by_clinic_id is null then p.id else null end,
        case when booked.referred_by_clinic_id is not null then booked.id else null end,
        a.id,a.service_id,
        round(a.service_price * least(100,greatest(0,coalesce(c.affiliate_commission_rate,config.affiliate_commission_rate,2))) / 100,2),
        least(100,greatest(0,coalesce(c.affiliate_commission_rate,config.affiliate_commission_rate,2))),a.currency
      from app.appointments a
      join app.partner_profiles p on p.id=a.partner_profile_id and p.organization_id=a.organization_id
      left join app.staff_applications application on application.id=p.application_id
      left join app.clinics booked on booked.id=a.clinic_id and booked.organization_id=a.organization_id
      join app.clinics c on c.id=coalesce(booked.referred_by_clinic_id,case when application.request_payload->>'clinicReferralId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (application.request_payload->>'clinicReferralId')::uuid end) and c.organization_id=a.organization_id
      left join app.staff_form_configs config on config.organization_id=a.organization_id
      where a.id=$1::uuid and a.status in ('confirmed','partner_acknowledged','in_progress','completed')
        and c.status='approved' and a.clinic_id is distinct from c.id
        and ((booked.referred_by_clinic_id is not null and booked.status='approved')
          or (booked.referred_by_clinic_id is null and not p.clinic_managed and application.referred_by_profile_id is null))
        and coalesce(a.metadata->'client_reward'->>'platformFunded','false') <> 'true'
        and exists(select 1 from app.appointment_payments pay where pay.appointment_id=a.id and pay.status='paid')
        and not exists(select 1 from app.appointment_payments pay where pay.appointment_id=a.id and pay.status in ('refunded','partially_refunded','failed'))
        and not exists (select 1 from app.clinic_memberships m where m.clinic_id=c.id and (m.partner_profile_id=p.id or m.email=lower(p.email)) and m.status <> 'removed')
        -- A clinic owned by the same person is not an external referral.
        and not exists(select 1 from app.clinic_memberships source_owner join app.clinic_memberships target_owner on target_owner.email=source_owner.email
          where source_owner.clinic_id=c.id and target_owner.clinic_id=booked.id
            and source_owner.role='owner' and target_owner.role='owner'
            and source_owner.status <> 'removed' and target_owner.status <> 'removed')
        and not exists (select 1 from app.partner_affiliate_commissions legacy where legacy.appointment_id=a.id)
      on conflict(appointment_id) do nothing returning id`, [appointmentId]);
    return rows[0]?.id || null;
}

// Exclude cancelled/refunded/unpaid visits from earnings without a polling job.
// Paid entries stay recorded for reconciliation; no payout is initiated here.
const commissionRows = `select c.id,c.amount,c.currency,c.rate,c.created_at,
  case when c.status='paid' then 'paid' when a.status not in ('confirmed','partner_acknowledged','in_progress','completed')
    or exists(select 1 from app.appointment_payments pay where pay.appointment_id=a.id and pay.status in ('refunded','partially_refunded','failed'))
    then 'void' else c.status end as status,
  a.public_reference as reference,coalesce(referred_clinic.name,p.display_name) as "partnerName",s.name as "serviceName"
  from app.clinic_affiliate_commissions c join app.appointments a on a.id=c.appointment_id
  left join app.partner_profiles p on p.id=c.referred_profile_id
  left join app.clinics referred_clinic on referred_clinic.id=c.referred_clinic_id left join app.services s on s.id=c.service_id
  where c.clinic_id=$1`;

const dashboard = unstable_cache(async (clinicId: string) => {
    const pool = getDbPool();
    const [clinic, metrics, partners, commissions] = await Promise.all([
        pool.query<{ slug: string; status: string; rate: string }>(`select c.slug,c.status,coalesce(c.affiliate_commission_rate,f.affiliate_commission_rate,2)::text as rate from app.clinics c left join app.staff_form_configs f on f.organization_id=c.organization_id where c.id=$1`, [clinicId]),
        pool.query<{ currency: string; earned: string; pending: string; paid: string; appointments: string }>(`with entries as (${commissionRows}) select currency,coalesce(sum(amount) filter(where status<>'void'),0)::text as earned,coalesce(sum(amount) filter(where status not in ('void','paid')),0)::text as pending,coalesce(sum(amount) filter(where status='paid'),0)::text as paid,count(*) filter(where status<>'void')::text as appointments from entries group by currency`, [clinicId]),
        pool.query<{ id: string; name: string; status: string; kind: 'nurse' | 'clinic' }>(`select id,name,status,kind from (
          select p.id,p.display_name as name,p.website_status as status,'nurse' as kind,p.created_at
            from app.staff_applications a join app.partner_profiles p on p.application_id=a.id
            where a.request_payload ? 'clinicReferralId' and a.request_payload->>'clinicReferralId'=$1 and a.referred_by_profile_id is null
          union all
          select c.id,c.name,c.status,'clinic' as kind,c.created_at from app.clinics c where c.referred_by_clinic_id=$1::uuid
        ) referrals order by created_at desc,id limit 50`, [clinicId]),
        pool.query<{ id: string; amount: string; currency: string; rate: string; status: string; reference: string; partnerName: string; serviceName: string }>(`${commissionRows} order by c.created_at desc limit 50`, [clinicId]),
    ]);
    const value = clinic.rows[0];
    if (!value) throw new Error('Clinic not found.');
    return { referralUrl: `https://partners.mydripnurse.com/clinics/${value.slug}/refer`, rate: Number(value.rate), status: value.status, metrics: metrics.rows, partners: partners.rows, commissions: commissions.rows };
}, ['clinic-affiliate-dashboard-v2'], { revalidate: 60 });

export async function getClinicAffiliateDashboard(clinicId: string) {
    const actor = await requireClinicManager(clinicId);
    if (actor.role !== 'owner') throw new Error('Only the clinic owner can view affiliate earnings.');
    return dashboard(clinicId);
}
export type ClinicAffiliateDashboard = Awaited<ReturnType<typeof getClinicAffiliateDashboard>>;
