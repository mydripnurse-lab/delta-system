import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import { ensureClientPortalSchema } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";
import { ghlRoutingFieldsForEvent, ghlRoutingFieldsForPayload } from "@/lib/ghlRoutingEnvelope";

export const CLIENT_REFERRAL_GOAL = 10;

export function safeClientReferralCode(value: unknown) {
  const code = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{20,80}$/.test(code) ? code : "";
}

export type ClientReferralInvite = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  status: "invited" | "registered" | "cancelled";
  registrationUrl: string;
  createdAt: string;
  registeredAt: string;
};

export type ClientReferralSummary = {
  goal: number;
  discountPercentage: number;
  discountPercentageLabel: string;
  invitedCount: number;
  registeredCount: number;
  remainingCount: number;
  percent: number;
  rewardStatus: "locked" | "available" | "redeemed";
  rewardAppointmentId: string;
  invites: ClientReferralInvite[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedPhone(value: unknown) {
  const digits = text(value).replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits;
}

function normalizedEmail(value: unknown) {
  return text(value).toLowerCase();
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || "A friend";
}

function registrationUrl(code: string) {
  const params = new URLSearchParams({ referral: code });
  return `https://care.mydripnurse.com/register?${params.toString()}`;
}

async function configuredReferralWebhookUrl() {
  await ensureStaffSchema();
  const result = await getDbPool().query<{ client_referral_webhook_url: string | null }>(
    `select config.client_referral_webhook_url
       from app.staff_form_configs config
       join app.organizations organization on organization.id = config.organization_id
      where organization.slug = 'my-drip-nurse'
      limit 1`,
  );
  return text(result.rows[0]?.client_referral_webhook_url);
}

async function deliverReferralWebhook(input: {
  inviteId: string;
  eventType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}) {
  const pool = getDbPool();
  const inserted = await pool.query<{ id: string }>(
    `insert into app.client_referral_webhook_deliveries (
       invite_id, event_type, idempotency_key, payload
     ) values ($1, $2, $3, $4::jsonb)
     on conflict (idempotency_key) do nothing
     returning id`,
    [input.inviteId, input.eventType, input.idempotencyKey, JSON.stringify(input.payload)],
  );
  const deliveryId = inserted.rows[0]?.id;
  if (!deliveryId) return { status: "duplicate" as const };

  const webhookUrl = await configuredReferralWebhookUrl();
  if (!webhookUrl) {
    await pool.query(
      `update app.client_referral_webhook_deliveries
          set status = 'not_configured', last_error = 'Client referral webhook is not configured.', updated_at = now()
        where id = $1`,
      [deliveryId],
    );
    return { status: "not_configured" as const };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Referral webhook returned HTTP ${response.status}.`);
    await pool.query(
      `update app.client_referral_webhook_deliveries
          set status = 'delivered', response_status = $2, delivered_at = now(), last_error = null, updated_at = now()
        where id = $1`,
      [deliveryId, response.status],
    );
    return { status: "delivered" as const };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Referral webhook timed out after 10 seconds."
      : error instanceof Error ? error.message : "Referral webhook delivery failed.";
    await pool.query(
      `update app.client_referral_webhook_deliveries
          set status = 'failed', last_error = $2, updated_at = now()
        where id = $1`,
      [deliveryId, message],
    );
    console.error("[client-referrals] webhook-failed", { deliveryId, eventType: input.eventType, error: message });
    return { status: "failed" as const };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getClientReferralSummary(accountId: string): Promise<ClientReferralSummary> {
  await ensureClientPortalSchema();
  const pool = getDbPool();
  const [invites, reward, configuredDiscounts] = await Promise.all([
    pool.query<{
      id: string; first_name: string; last_name: string; phone: string; email: string; public_code: string;
      status: "invited" | "registered" | "cancelled"; created_at: string; registered_at: string | null;
    }>(
      `select id, first_name, last_name, phone, email, public_code, status,
              created_at::text, registered_at::text
         from app.client_referral_invites
        where inviter_account_id = $1 and status <> 'cancelled'
        order by created_at desc`,
      [accountId],
    ),
    pool.query<{ status: "available" | "redeemed" | "cancelled"; appointment_id: string | null }>(
      `select status, appointment_id::text
         from app.client_referral_rewards
        where client_account_id = $1
        limit 1`,
      [accountId],
    ),
    pool.query<{ deposit_percentage: string }>(
      `select distinct service.deposit_value::numeric as deposit_percentage
         from app.services service
         join app.organizations organization on organization.id = service.organization_id
        where (lower(organization.slug) = 'my-drip-nurse' or lower(organization.name) = 'my drip nurse')
          and service.is_active = true
          and service.editorial_status <> 'archived'
          and service.deposit_type = 'percentage'
          and service.deposit_value > 0
        order by deposit_percentage asc`,
    ),
  ]);
  const percentages = configuredDiscounts.rows
    .map((row) => Number(row.deposit_percentage))
    .filter((value) => Number.isFinite(value) && value > 0);
  const minimumPercentage = percentages[0] || 35;
  const maximumPercentage = percentages[percentages.length - 1] || minimumPercentage;
  const discountPercentageLabel = minimumPercentage === maximumPercentage
    ? `${minimumPercentage}%`
    : `${minimumPercentage}%–${maximumPercentage}%`;
  const registeredCount = invites.rows.filter((invite) => invite.status === "registered").length;
  const rewardRow = reward.rows[0];
  const rewardStatus = rewardRow?.status === "available"
    ? "available"
    : rewardRow?.status === "redeemed" ? "redeemed" : "locked";
  return {
    goal: CLIENT_REFERRAL_GOAL,
    discountPercentage: minimumPercentage,
    discountPercentageLabel,
    invitedCount: invites.rows.length,
    registeredCount,
    remainingCount: Math.max(0, CLIENT_REFERRAL_GOAL - registeredCount),
    percent: Math.min(100, Math.round((registeredCount / CLIENT_REFERRAL_GOAL) * 100)),
    rewardStatus,
    rewardAppointmentId: rewardRow?.appointment_id || "",
    invites: invites.rows.map((invite) => ({
      id: invite.id,
      firstName: invite.first_name,
      lastName: invite.last_name,
      phone: invite.phone,
      email: invite.email,
      status: invite.status,
      registrationUrl: registrationUrl(invite.public_code),
      createdAt: new Date(invite.created_at).toISOString(),
      registeredAt: invite.registered_at ? new Date(invite.registered_at).toISOString() : "",
    })),
  };
}

export async function createClientReferralInvite(accountId: string, input: {
  firstName: unknown;
  lastName: unknown;
  phone: unknown;
  email?: unknown;
}) {
  await ensureClientPortalSchema();
  const inviteFirstName = text(input.firstName);
  const inviteLastName = text(input.lastName);
  const phone = text(input.phone);
  const phoneKey = normalizedPhone(phone);
  const email = normalizedEmail(input.email);
  if (!inviteFirstName || !inviteLastName) throw new Error("First and last name are required.");
  if (inviteFirstName.length > 80 || inviteLastName.length > 80) throw new Error("Invitee names must be 80 characters or fewer.");
  if (phoneKey.length !== 11 || !phoneKey.startsWith("1")) throw new Error("Enter a valid U.S. mobile number.");
  if (email && (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)) throw new Error("Enter a valid email address or leave it blank.");

  const pool = getDbPool();
  const inviterResult = await pool.query<{
    id: string; full_name: string; email: string; phone: string; email_verified_at: string | null;
  }>(
    `select id, full_name, email, phone, email_verified_at::text
       from app.client_accounts where id = $1 limit 1`,
    [accountId],
  );
  const inviter = inviterResult.rows[0];
  if (!inviter?.email_verified_at) throw new Error("Verify your Care account before inviting friends.");
  if (normalizedPhone(inviter.phone) === phoneKey || normalizedEmail(inviter.email) === email) {
    throw new Error("You cannot send a referral invitation to your own account.");
  }
  const registered = await pool.query(
    `select 1
       from app.client_accounts
      where email_verified_at is not null
        and (($2 <> '' and normalized_email = $2)
          or regexp_replace(phone, '[^0-9]', '', 'g') in ($1, right($1, 10)))
      limit 1`,
    [phoneKey, email],
  );
  if (registered.rows[0]) throw new Error("This person already has a My Drip Nurse Care account.");

  const publicCode = randomBytes(18).toString("base64url");
  let created;
  try {
    created = await pool.query<{ id: string; created_at: string }>(
      `insert into app.client_referral_invites (
         inviter_account_id, first_name, last_name, phone, normalized_phone,
         email, normalized_email, public_code, sent_at
       ) values ($1, $2, $3, $4, $5, $6, $6, $7, now())
       returning id, created_at::text`,
      [accountId, inviteFirstName, inviteLastName, phone, phoneKey, email, publicCode],
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      throw new Error("This mobile number has already been invited to the program.");
    }
    throw error;
  }
  const invite = created.rows[0];
  if (!invite) throw new Error("The invitation could not be created.");
  const url = registrationUrl(publicCode);
  const summary = await getClientReferralSummary(accountId);
  const smsMessage = `Hi ${inviteFirstName}! ${firstName(inviter.full_name)} sent you a personal invitation to My Drip Nurse Care. Create your free account and explore mobile wellness care: ${url}`;
  const payload = {
    event: "client.referral.invite.created",
    ...ghlRoutingFieldsForEvent("client.referral.invite.created"),
    version: 1,
    success: true,
    test: false,
    idempotencyKey: `client.referral.invite.created:${invite.id}`,
    occurredAt: new Date().toISOString(),
    firstName: inviteFirstName,
    lastName: inviteLastName,
    fullName: `${inviteFirstName} ${inviteLastName}`,
    phone,
    email,
    registrationUrl: url,
    smsMessage,
    goal: CLIENT_REFERRAL_GOAL,
    registeredCount: summary.registeredCount,
    remainingCount: summary.remainingCount,
    inviter: {
      accountId: inviter.id,
      fullName: inviter.full_name,
      firstName: firstName(inviter.full_name),
      email: inviter.email,
      phone: inviter.phone,
    },
    invitee: { firstName: inviteFirstName, lastName: inviteLastName, fullName: `${inviteFirstName} ${inviteLastName}`, phone, email },
  };
  Object.assign(payload, ghlRoutingFieldsForPayload("client.referral.invite.created", payload));
  const delivery = await deliverReferralWebhook({
    inviteId: invite.id,
    eventType: "client.referral.invite.created",
    idempotencyKey: `client.referral.invite.created:${invite.id}`,
    payload,
  });
  return { inviteId: invite.id, registrationUrl: url, smsMessage, deliveryStatus: delivery.status, summary };
}

export async function claimClientReferralRegistration(accountId: string, suppliedCode?: string) {
  await ensureClientPortalSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  let claimed: null | {
    inviteId: string; inviterId: string; inviteeName: string; inviteePhone: string; inviteeEmail: string;
    inviterName: string; inviterEmail: string; inviterPhone: string; registeredCount: number; rewardCreated: boolean;
  } = null;
  try {
    await client.query("begin");
    const accountResult = await client.query<{
      id: string; full_name: string; email: string; phone: string; email_verified_at: string | null; referral_code: string;
    }>(
      `select id, full_name, email, phone, email_verified_at::text,
              coalesce(preferences #>> '{referral,pendingCode}', '') as referral_code
         from app.client_accounts where id = $1 for update`,
      [accountId],
    );
    const account = accountResult.rows[0];
    const code = text(suppliedCode) || text(account?.referral_code);
    if (!account?.email_verified_at || !code) {
      await client.query("commit");
      return { claimed: false, rewardCreated: false };
    }
    const inviteResult = await client.query<{
      id: string; inviter_account_id: string; first_name: string; last_name: string; phone: string; email: string;
      status: string; registered_account_id: string | null; inviter_name: string; inviter_email: string; inviter_phone: string;
    }>(
      `select invite.id, invite.inviter_account_id, invite.first_name, invite.last_name,
              invite.phone, invite.email, invite.status, invite.registered_account_id,
              inviter.full_name as inviter_name, inviter.email as inviter_email,
              inviter.phone as inviter_phone
         from app.client_referral_invites invite
         join app.client_accounts inviter on inviter.id = invite.inviter_account_id
        where invite.public_code = $1
        for update of invite
        limit 1`,
      [code],
    );
    const invite = inviteResult.rows[0];
    if (!invite || invite.status === "cancelled" || invite.inviter_account_id === accountId) {
      await client.query(
        `update app.client_accounts
            set preferences = preferences #- '{referral,pendingCode}', updated_at = now()
          where id = $1`,
        [accountId],
      );
      await client.query("commit");
      return { claimed: false, rewardCreated: false };
    }
    if (invite.status === "registered") {
      await client.query("commit");
      return { claimed: invite.registered_account_id === accountId, rewardCreated: false };
    }
    await client.query(
      `update app.client_referral_invites
          set status = 'registered', registered_account_id = $2, registered_at = now(), updated_at = now()
        where id = $1`,
      [invite.id, accountId],
    );
    await client.query(
      `update app.client_accounts
          set phone = case when phone = '' then $2 else phone end,
              preferences = preferences #- '{referral,pendingCode}',
              updated_at = now()
        where id = $1`,
      [accountId, invite.phone],
    );
    const progress = await client.query<{ count: string }>(
      `select count(*)::text as count
         from app.client_referral_invites
        where inviter_account_id = $1 and status = 'registered'`,
      [invite.inviter_account_id],
    );
    const registeredCount = Number(progress.rows[0]?.count || 0);
    let rewardCreated = false;
    if (registeredCount >= CLIENT_REFERRAL_GOAL) {
      const reward = await client.query<{ id: string }>(
        `insert into app.client_referral_rewards (client_account_id, goal_count, metadata)
         values ($1, $2, jsonb_build_object('registeredCountAtEarn', $3::integer))
         on conflict (client_account_id) do nothing
         returning id`,
        [invite.inviter_account_id, CLIENT_REFERRAL_GOAL, registeredCount],
      );
      rewardCreated = Boolean(reward.rows[0]);
    }
    await client.query("commit");
    claimed = {
      inviteId: invite.id,
      inviterId: invite.inviter_account_id,
      inviteeName: account.full_name || `${invite.first_name} ${invite.last_name}`,
      inviteePhone: invite.phone,
      inviteeEmail: account.email,
      inviterName: invite.inviter_name,
      inviterEmail: invite.inviter_email,
      inviterPhone: invite.inviter_phone,
      registeredCount,
      rewardCreated,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return { claimed: false, rewardCreated: false };
    }
    throw error;
  } finally {
    client.release();
  }
  if (!claimed) return { claimed: false, rewardCreated: false };

  const registeredPayload = {
    event: "client.referral.registered",
    ...ghlRoutingFieldsForEvent("client.referral.registered"),
    version: 1,
    success: true,
    test: false,
    idempotencyKey: `client.referral.registered:${claimed.inviteId}`,
    occurredAt: new Date().toISOString(),
    goal: CLIENT_REFERRAL_GOAL,
    registeredCount: claimed.registeredCount,
    remainingCount: Math.max(0, CLIENT_REFERRAL_GOAL - claimed.registeredCount),
    inviter: {
      accountId: claimed.inviterId,
      fullName: claimed.inviterName,
      email: claimed.inviterEmail,
      phone: claimed.inviterPhone,
    },
    invitee: { fullName: claimed.inviteeName, phone: claimed.inviteePhone, email: claimed.inviteeEmail },
    rewardEarned: claimed.rewardCreated,
  };
  Object.assign(registeredPayload, ghlRoutingFieldsForPayload("client.referral.registered", registeredPayload));
  await deliverReferralWebhook({
    inviteId: claimed.inviteId,
    eventType: "client.referral.registered",
    idempotencyKey: `client.referral.registered:${claimed.inviteId}`,
    payload: registeredPayload,
  });
  if (claimed.rewardCreated) {
    await deliverReferralWebhook({
      inviteId: claimed.inviteId,
      eventType: "client.referral.reward.earned",
      idempotencyKey: `client.referral.reward.earned:${claimed.inviterId}`,
      payload: (() => {
        const rewardPayload = {
        ...registeredPayload,
        event: "client.referral.reward.earned",
        ...ghlRoutingFieldsForEvent("client.referral.reward.earned"),
        idempotencyKey: `client.referral.reward.earned:${claimed.inviterId}`,
        reward: {
          status: "available",
          type: "next_appointment_deposit_waiver",
          description: "The My Drip Nurse deposit is waived once on the inviter's next eligible appointment.",
        },
        };
        return {
          ...rewardPayload,
          ...ghlRoutingFieldsForPayload("client.referral.reward.earned", rewardPayload),
        };
      })(),
    });
  }
  return { claimed: true, rewardCreated: claimed.rewardCreated };
}

export async function availableClientReferralReward(client: PoolClient, accountId: string) {
  const result = await client.query<{ id: string }>(
    `select id
       from app.client_referral_rewards
      where client_account_id = $1 and status = 'available'
      for update
      limit 1`,
    [accountId],
  );
  return result.rows[0]?.id || "";
}

export async function redeemClientReferralReward(client: PoolClient, input: {
  rewardId: string;
  accountId: string;
  appointmentId: string;
  depositWaivedCents: number;
}) {
  if (!input.rewardId) return false;
  const result = await client.query(
    `update app.client_referral_rewards
        set status = 'redeemed', appointment_id = $3, redeemed_at = now(),
            metadata = metadata || jsonb_build_object('depositWaivedCents', $4::integer),
            updated_at = now()
      where id = $1 and client_account_id = $2 and status = 'available'`,
    [input.rewardId, input.accountId, input.appointmentId, input.depositWaivedCents],
  );
  return result.rowCount === 1;
}
