import type { PoolClient } from "pg";

import { ensureClientPortalSchema } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";

export const CLIENT_COMPLETED_VISIT_REWARD_GOAL = 10;
export const CLIENT_NAD_VISIT_REWARD_GOAL = 6;

export type ClientVisitRewardProgram = "wellness" | "nad_family";

export type ClientVisitRewardSummary = {
  program: ClientVisitRewardProgram;
  goal: number;
  completedVisits: number;
  cycleCompletedVisits: number;
  remainingVisits: number;
  percent: number;
  availableRewards: number;
  earnedRewards: number;
  redeemedRewards: number;
  nextMilestone: number;
};

export type ClientBookingReward = {
  id: string;
  type: "referral" | "completed_visits";
  program: ClientVisitRewardProgram | null;
};

const NAD_SERVICE_SLUGS = ["nad-plus", "nad-boost"] as const;

export function isNadRewardService(serviceSlug: string) {
  return NAD_SERVICE_SLUGS.includes(serviceSlug.trim().toLowerCase() as (typeof NAD_SERVICE_SLUGS)[number]);
}

function rewardGoal(program: ClientVisitRewardProgram) {
  return program === "nad_family" ? CLIENT_NAD_VISIT_REWARD_GOAL : CLIENT_COMPLETED_VISIT_REWARD_GOAL;
}

async function completedVisitCount(client: PoolClient, accountId: string, program: ClientVisitRewardProgram) {
  const result = await client.query<{ count: string }>(
    `select count(distinct appointment.id)::text as count
       from app.appointments appointment
       left join app.services service on service.id = appointment.service_id
      where appointment.status = 'completed'
        and (
          ($2::text = 'nad_family' and lower(coalesce(service.slug, '')) in ('nad-plus', 'nad-boost'))
          or ($2::text = 'wellness' and lower(coalesce(service.slug, '')) not in ('nad-plus', 'nad-boost'))
        )
        and (
          exists (
            select 1
              from app.client_customer_links link
             where link.client_account_id = $1
               and link.booking_customer_id = appointment.customer_id
          )
          or exists (
            select 1
              from app.client_appointment_access access
             where access.client_account_id = $1
               and access.appointment_id = appointment.id
          )
        )`,
    [accountId, program],
  );
  return Number(result.rows[0]?.count || 0);
}

async function syncClientVisitRewards(client: PoolClient, accountId: string, program: ClientVisitRewardProgram) {
  const goal = rewardGoal(program);
  await client.query(
    `select id
       from app.client_accounts
      where id = $1
      for update`,
    [accountId],
  );
  await client.query(
    `update app.client_visit_rewards
        set milestone_number = milestone_number + 1000000,
            status = case when status = 'available' then 'cancelled' else status end,
            metadata = metadata || jsonb_build_object(
              'legacyGoalCount', goal_count,
              'supersededByGoalCount', $3::integer
            ),
            updated_at = now()
      where client_account_id = $1
        and reward_program = $2
        and goal_count <> $3
        and milestone_number < 1000000`,
    [accountId, program, goal],
  );
  const completedVisits = await completedVisitCount(client, accountId, program);
  const earnedMilestones = Math.floor(completedVisits / goal);
  await client.query(
    `update app.client_visit_rewards
        set status = 'cancelled',
            metadata = metadata || jsonb_build_object('cancelledReason', 'progress_recalculated'),
            updated_at = now()
      where client_account_id = $1
        and reward_program = $2
        and goal_count = $3
        and milestone_number > $4
        and status = 'available'`,
    [accountId, program, goal, earnedMilestones],
  );
  if (earnedMilestones > 0) {
    await client.query(
      `insert into app.client_visit_rewards (
         client_account_id, reward_program, milestone_number, goal_count, metadata
       )
       select $1, $2, milestone, $3,
              jsonb_build_object(
                'rewardProgram', $2::text,
                'completedVisitsAtEarn', milestone * $3,
                'benefit', 'next_eligible_appointment_free',
                'eligibleServiceFamily', case when $2 = 'nad_family' then 'nad' else 'non_nad' end,
                'clientCharge', 0,
                'partnerPaymentReduced', false,
                'fundedBy', 'my_drip_nurse'
              )
         from generate_series(1, $4) milestone
       on conflict (client_account_id, reward_program, milestone_number) do nothing`,
      [accountId, program, goal, earnedMilestones],
    );
  }
  return completedVisits;
}

export async function getClientVisitRewardSummary(
  accountId: string,
  program: ClientVisitRewardProgram = "wellness",
): Promise<ClientVisitRewardSummary> {
  await ensureClientPortalSchema();
  const goal = rewardGoal(program);
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    const completedVisits = await syncClientVisitRewards(client, accountId, program);
    const rewards = await client.query<{ status: "available" | "redeemed" | "cancelled" }>(
      `select status
         from app.client_visit_rewards
        where client_account_id = $1
          and reward_program = $2
          and goal_count = $3
        order by milestone_number asc`,
      [accountId, program, goal],
    );
    await client.query("commit");

    const availableRewards = rewards.rows.filter((reward) => reward.status === "available").length;
    const redeemedRewards = rewards.rows.filter((reward) => reward.status === "redeemed").length;
    const earnedRewards = availableRewards + redeemedRewards;
    const remainder = completedVisits % goal;
    const cycleCompletedVisits = availableRewards > 0 && remainder === 0
      ? goal
      : remainder;
    return {
      program,
      goal,
      completedVisits,
      cycleCompletedVisits,
      remainingVisits: availableRewards > 0 ? 0 : goal - remainder,
      percent: Math.round((cycleCompletedVisits / goal) * 100),
      availableRewards,
      earnedRewards,
      redeemedRewards,
      nextMilestone: (Math.floor(completedVisits / goal) + 1) * goal,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function availableClientBookingReward(
  client: PoolClient,
  accountId: string,
  input: { serviceSlug: string },
): Promise<ClientBookingReward | null> {
  const program: ClientVisitRewardProgram = isNadRewardService(input.serviceSlug) ? "nad_family" : "wellness";
  const goal = rewardGoal(program);
  await syncClientVisitRewards(client, accountId, program);
  const result = await client.query<{
    id: string;
    reward_type: "referral" | "completed_visits";
    reward_program: ClientVisitRewardProgram | null;
  }>(
    `select reward.id, reward.reward_type, reward.reward_program
       from (
         select id, 'referral'::text as reward_type, null::text as reward_program, earned_at
           from app.client_referral_rewards
          where client_account_id = $1 and status = 'available'
         union all
         select id, 'completed_visits'::text as reward_type, reward_program, earned_at
           from app.client_visit_rewards
          where client_account_id = $1
            and status = 'available'
            and reward_program = $2
            and goal_count = $3
      ) reward
      order by reward.earned_at asc
      limit 1`,
    [accountId, program, goal],
  );
  const reward = result.rows[0];
  return reward ? { id: reward.id, type: reward.reward_type, program: reward.reward_program } : null;
}

export async function redeemClientBookingReward(client: PoolClient, input: {
  reward: ClientBookingReward;
  accountId: string;
  appointmentId: string;
  depositWaivedCents: number;
  benefit: "deposit_waiver" | "free_appointment";
  serviceWaivedCents?: number;
  partnerFundedCents?: number;
}) {
  const table = input.reward.type === "referral" ? "client_referral_rewards" : "client_visit_rewards";
  const result = await client.query(
    `update app.${table}
        set status = 'redeemed', appointment_id = $3, redeemed_at = now(),
            metadata = metadata || jsonb_build_object(
              'depositWaivedCents', $4::integer,
              'benefit', $5::text,
              'serviceWaivedCents', $6::integer,
              'partnerFundedCents', $7::integer,
              'rewardProgram', $8::text,
              'fundedBy', case when $5 = 'free_appointment' then 'my_drip_nurse' else null end
            ),
            updated_at = now()
      where id = $1 and client_account_id = $2 and status = 'available'`,
    [
      input.reward.id,
      input.accountId,
      input.appointmentId,
      input.depositWaivedCents,
      input.benefit,
      input.serviceWaivedCents || 0,
      input.partnerFundedCents || 0,
      input.reward.program,
    ],
  );
  return result.rowCount === 1;
}
