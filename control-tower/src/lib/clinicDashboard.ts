import { CLINIC_CARE_MEMBER_SQL } from '@/lib/clinicPolicy';
import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDbPool } from '@/lib/db';
import { requireClinicManager } from '@/lib/clinicAuth';
import { CLINIC_CACHE_TAG } from '@/lib/clinicPolicy';

export type ClinicMetric = {
    profileId: string | null; overall: boolean; currency: string;
    appointments: number; completed: number; cancelled: number; upcoming: number;
    serviceValue: string; completedBalance: string; pipelineBalance: string;
    deposits: string; refunds: string;
};
export type ClinicTeamMetric = {
    id: string; name: string; slug: string; status: string; visible: boolean;
    availability: boolean; accepted: number; declined: number;
    impressions: number; profileClicks: number; bookingClicks: number;
};

// No patient records leave this query. Appointment indexes scope all reads to one clinic.
const cachedDashboard = unstable_cache(async (clinicId: string, days: number) => {
    const pool = getDbPool();
    const [metrics, roster, decisions] = await Promise.all([
        pool.query<ClinicMetric>(`
          with visits as (
            select a.id,a.partner_profile_id,a.currency,a.status,a.starts_at,a.service_price,a.deposit_amount,
              coalesce(a.metadata->'client_reward'->>'platformFunded','false')='true' as reward,
              p.status as payment_status,p.amount,p.refunded_amount,
              a.starts_at < now() as past
            from app.appointments a left join app.appointment_payments p on p.appointment_id=a.id
            where a.clinic_id=$1 and a.starts_at >= now()-make_interval(days=>$2)
              and a.starts_at < now()+interval '30 days'
          )
          select partner_profile_id as "profileId",grouping(partner_profile_id)=1 as overall,currency,
            count(*) filter(where past)::int as appointments,
            count(*) filter(where past and status='completed')::int as completed,
            count(*) filter(where past and status in ('cancelled','failed','refunded'))::int as cancelled,
            count(*) filter(where not past and status in ('confirmed','partner_acknowledged','in_progress'))::int as upcoming,
            coalesce(sum(service_price) filter(where past and status='completed' and not reward),0)::text as "serviceValue",
            coalesce(sum(greatest(service_price-deposit_amount,0)) filter(where past and status='completed' and not reward and payment_status='paid'),0)::text as "completedBalance",
            coalesce(sum(greatest(service_price-deposit_amount,0)) filter(where not past and status in ('confirmed','partner_acknowledged','in_progress') and not reward and payment_status='paid'),0)::text as "pipelineBalance",
            coalesce(sum(greatest(amount-refunded_amount,0)) filter(where past and payment_status in ('paid','partially_refunded')),0)::text as deposits,
            coalesce(sum(refunded_amount) filter(where past and payment_status in ('refunded','partially_refunded')),0)::text as refunds
          from visits group by grouping sets ((currency),(partner_profile_id,currency))
          order by overall desc,currency,partner_profile_id`, [clinicId, days]),
        pool.query<ClinicTeamMetric>(`
          select p.id,p.display_name as name,p.slug,m.status,
            c.status='approved' and c.published and m.status='active' and m.accepted_at is not null
              and p.website_status='published' and p.profile_consent_at is not null as visible,
            exists(select 1 from app.partner_availability_rules r where r.partner_profile_id=p.id and r.is_active) as availability
          from app.clinic_memberships m join app.clinics c on c.id=m.clinic_id
            join app.partner_profiles p on p.id=m.partner_profile_id
          where m.clinic_id=$1 and ${CLINIC_CARE_MEMBER_SQL} and m.status <> 'removed'
          order by p.display_name,p.id limit 201`, [clinicId]),
        // Attribute each decision to its actor, even if the visit was later reassigned.
        pool.query<{ id: string; accepted: number; declined: number }>(`
          select e.actor_id as id,
            count(distinct e.appointment_id) filter(where e.event_type='partner_acknowledged')::int as accepted,
            count(distinct e.appointment_id) filter(where e.event_type='partner_declined')::int as declined
          from app.appointments a join app.appointment_events e on e.appointment_id=a.id
          where a.clinic_id=$1 and a.starts_at >= now()-make_interval(days=>$2) and a.starts_at < now()+interval '30 days'
            and e.actor_type='partner' and e.event_type in ('partner_acknowledged','partner_declined')
          group by e.actor_id`, [clinicId, days]),
    ]);
    // Reuse existing daily counters; no event collection or schema writes on dashboard reads.
    let directoryAvailable = true;
    let traffic: { id: string; impressions: number; profileClicks: number; bookingClicks: number }[] = [];
    try {
        const result = await pool.query<typeof traffic[number]>(`
          select m.partner_profile_id as id,sum(d.impressions)::float8 as impressions,
            sum(d.profile_clicks)::float8 as "profileClicks",sum(d.booking_clicks)::float8 as "bookingClicks"
          from app.clinic_memberships m join app.partner_directory_daily_metrics d on d.partner_profile_id=m.partner_profile_id
          where m.clinic_id=$1 and ${CLINIC_CARE_MEMBER_SQL} and m.status <> 'removed' and m.accepted_at is not null
            and d.metric_date >= greatest((now()-make_interval(days=>$2))::date,m.accepted_at::date)
            and d.metric_date <= current_date group by m.partner_profile_id`, [clinicId, days]);
        traffic = result.rows;
    } catch (error) {
        if ((error as { code?: string }).code !== '42P01') throw error;
        directoryAvailable = false;
    }
    const decisionMap = new Map<string, { id: string; accepted: number; declined: number }>(decisions.rows.map(r => [r.id, r]));
    const trafficMap = new Map(traffic.map(r => [r.id, r]));
    return {
        days, generatedAt: new Date().toISOString(), directoryAvailable, teamTruncated: roster.rows.length > 200,
        metrics: metrics.rows,
        decisions: decisions.rows.reduce((s, r) => ({ accepted: s.accepted + r.accepted, declined: s.declined + r.declined }), { accepted: 0, declined: 0 }),
        team: roster.rows.slice(0, 200).map(r => ({ ...r, accepted: 0, declined: 0, impressions: 0, profileClicks: 0, bookingClicks: 0, ...decisionMap.get(r.id), ...trafficMap.get(r.id) })),
    };
}, ['clinic-performance-v1'], { revalidate: 60, tags: [CLINIC_CACHE_TAG] });

export async function getClinicDashboard(clinicId: string, days: number = 30) {
    const actor = await requireClinicManager(clinicId); // Always authorize outside the shared cache.
    if (actor.status !== 'approved') throw new Error('Your clinic is awaiting My Drip Nurse approval.');
    if (![30, 90, 365].includes(days)) throw new Error('Choose a supported reporting period.');
    return cachedDashboard(clinicId, days);
}
export type ClinicDashboardData = Awaited<ReturnType<typeof getClinicDashboard>>;
