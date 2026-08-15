import type { PoolClient } from "pg";

import { ensureClientPortalSchema } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";

export const CLIENT_COMPLETED_VISIT_REWARD_GOAL = 10;

export type ClientVisitRewardSummary = {
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
};

async function completedVisitCount(client: PoolClient, accountId: string) {
  const result = await client.query<{ count: string }>(
    `select count(distinct appointment.id)::text as count
       from app.appointments appointment
      where appointment.status = 'completed'
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
    [accountId],
  );
  return Number(result.rows[0]?.count || 0);
}

async function syncClientVisitRewards(client: PoolClient, accountId: string) {
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
              'supersededByGoalCount', $2::integer
            ),
            updated_at = now()
      where client_account_id = $1
        and goal_count <> $2
        and milestone_number < 1000000`,
    [accountId, CLIENT_COMPLETED_VISIT_REWARD_GOAL],
  );
  const completedVisits = await completedVisitCount(client, accountId);
  const earnedMilestones = Math.floor(completedVisits / CLIENT_COMPLETED_VISIT_REWARD_GOAL);
  if (earnedMilestones > 0) {
    await client.query(
      `insert into app.client_visit_rewards (
         client_account_id, milestone_number, goal_count, metadata
       )
       select $1, milestone, $2,
              jsonb_build_object(
                'completedVisitsAtEarn', milestone * $2,
                'benefit', 'next_eligible_appointment_free',
                'clientCharge', 0,
                'partnerPaymentReduced', false,
                'fundedBy', 'my_drip_nurse'
              )
         from generate_series(1, $3) milestone
       on conflict (client_account_id, milestone_number) do nothing`,
      [accountId, CLIENT_COMPLETED_VISIT_REWARD_GOAL, earnedMilestones],
    );
  }
  return completedVisits;
}

export async function getClientVisitRewardSummary(accountId: string): Promise<ClientVisitRewardSummary> {
  await ensureClientPortalSchema();
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    const completedVisits = await syncClientVisitRewards(client, accountId);
    const rewards = await client.query<{ status: "available" | "redeemed" | "cancelled" }>(
      `select status
         from app.client_visit_rewards
        where client_account_id = $1
          and goal_count = $2
        order by milestone_number asc`,
      [accountId, CLIENT_COMPLETED_VISIT_REWARD_GOAL],
    );
    await client.query("commit");

    const availableRewards = rewards.rows.filter((reward) => reward.status === "available").length;
    const redeemedRewards = rewards.rows.filter((reward) => reward.status === "redeemed").length;
    const earnedRewards = availableRewards + redeemedRewards;
    const remainder = completedVisits % CLIENT_COMPLETED_VISIT_REWARD_GOAL;
    const cycleCompletedVisits = availableRewards > 0 && remainder === 0
      ? CLIENT_COMPLETED_VISIT_REWARD_GOAL
      : remainder;
    return {
      goal: CLIENT_COMPLETED_VISIT_REWARD_GOAL,
      completedVisits,
      cycleCompletedVisits,
      remainingVisits: availableRewards > 0 ? 0 : CLIENT_COMPLETED_VISIT_REWARD_GOAL - remainder,
      percent: Math.round((cycleCompletedVisits / CLIENT_COMPLETED_VISIT_REWARD_GOAL) * 100),
      availableRewards,
      earnedRewards,
      redeemedRewards,
      nextMilestone: (Math.floor(completedVisits / CLIENT_COMPLETED_VISIT_REWARD_GOAL) + 1) * CLIENT_COMPLETED_VISIT_REWARD_GOAL,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function availableClientBookingReward(client: PoolClient, accountId: string): Promise<ClientBookingReward | null> {
  await syncClientVisitRewards(client, accountId);
  const result = await client.query<{ id: string; reward_type: "referral" | "completed_visits" }>(
    `select reward.id, reward.reward_type
       from (
         select id, 'referral'::text as reward_type, earned_at
           from app.client_referral_rewards
          where client_account_id = $1 and status = 'available'
         union all
         select id, 'completed_visits'::text as reward_type, earned_at
           from app.client_visit_rewards
          where client_account_id = $1
            and status = 'available'
            and goal_count = $2
      ) reward
      order by reward.earned_at asc
      limit 1`,
    [accountId, CLIENT_COMPLETED_VISIT_REWARD_GOAL],
  );
  const reward = result.rows[0];
  return reward ? { id: reward.id, type: reward.reward_type } : null;
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
    ],
  );
  return result.rowCount === 1;
}
