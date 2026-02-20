import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDbPool } from "@/lib/db";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function getBaseAppUrl() {
  const direct = s(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL);
  if (direct) return direct.replace(/\/+$/, "");
  const vercelHost = s(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL);
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3001";
}

export function getDefaultActivationBaseUrl() {
  return `${getBaseAppUrl()}/activate`;
}

type InviteWebhookSettings = {
  webhookUrl: string;
  activationBaseUrl: string;
};

const DEFAULT_SETTINGS: InviteWebhookSettings = {
  webhookUrl: "",
  activationBaseUrl: "",
};

const SETTING_KEY = "staff_invite_webhooks_v1";

export function normalizeInviteWebhookSettings(input: Record<string, unknown> | null | undefined): InviteWebhookSettings {
  const activationBaseUrl = s(input?.activationBaseUrl);
  const webhookUrl = s(input?.webhookUrl);
  return {
    webhookUrl,
    activationBaseUrl,
  };
}

export async function readInviteWebhookSettings(pool: Pool = getDbPool()): Promise<InviteWebhookSettings> {
  const q = await pool.query<{ payload: Record<string, unknown> | null }>(
    `
      select payload
      from app.agency_settings
      where setting_key = $1
      limit 1
    `,
    [SETTING_KEY],
  );
  const payload = q.rows[0]?.payload || {};
  return normalizeInviteWebhookSettings(payload);
}

export async function saveInviteWebhookSettings(
  payload: Record<string, unknown>,
  pool: Pool = getDbPool(),
): Promise<InviteWebhookSettings> {
  const normalized = normalizeInviteWebhookSettings(payload);
  await pool.query(
    `
      insert into app.agency_settings (setting_key, payload)
      values ($1, $2::jsonb)
      on conflict (setting_key)
      do update set
        payload = excluded.payload,
        updated_at = now()
    `,
    [SETTING_KEY, JSON.stringify(normalized)],
  );
  return normalized;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueActivationToken(
  client: PoolClient,
  input: { userId: string; context?: string; metadata?: Record<string, unknown>; ttlHours?: number },
) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const ttlHours = Math.max(1, Number(input.ttlHours || 72));
  await client.query(
    `
      insert into app.user_activation_tokens (user_id, token_hash, context, metadata, expires_at)
      values ($1, $2, $3, $4::jsonb, now() + ($5::text || ' hours')::interval)
    `,
    [input.userId, tokenHash, s(input.context) || "staff_invite", JSON.stringify(input.metadata || {}), String(ttlHours)],
  );
  return rawToken;
}

export async function consumeActivationToken(client: PoolClient, rawToken: string) {
  const tokenHash = hashToken(s(rawToken));
  if (!tokenHash) return null;
  const q = await client.query<{ user_id: string }>(
    `
      update app.user_activation_tokens
      set used_at = now()
      where token_hash = $1
        and used_at is null
        and expires_at > now()
      returning user_id
    `,
    [tokenHash],
  );
  return q.rows[0]?.user_id || null;
}

export async function findOrCreateUserIdentity(
  client: PoolClient,
  input: { email: string; fullName?: string; phone?: string; isActive?: boolean },
) {
  const email = s(input.email).toLowerCase();
  if (!email) throw new Error("email is required");
  const fullName = s(input.fullName);
  const phone = s(input.phone);
  const isActive = input.isActive !== false;

  const existing = await client.query<{ id: string }>(
    `select id from app.users where lower(email) = lower($1) limit 1`,
    [email],
  );
  if (existing.rows[0]?.id) {
    await client.query(
      `
        update app.users
        set
          full_name = coalesce(nullif($2, ''), full_name),
          phone = coalesce(nullif($3, ''), phone),
          is_active = case when is_active = false and $4 = true then true else is_active end
        where id = $1
      `,
      [existing.rows[0].id, fullName, phone, isActive],
    );
    return existing.rows[0].id;
  }

  try {
    const inserted = await client.query<{ id: string }>(
      `
        insert into app.users (email, full_name, phone, is_active)
        values ($1, nullif($2, ''), nullif($3, ''), $4)
        returning id
      `,
      [email, fullName, phone, isActive],
    );
    return inserted.rows[0]?.id || null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("users_email_lower_uq")) throw error;
    const fallback = await client.query<{ id: string }>(
      `select id from app.users where lower(email) = lower($1) limit 1`,
      [email],
    );
    return fallback.rows[0]?.id || null;
  }
}

export async function sendStaffInviteWebhook(input: {
  scope: "agency" | "tenant";
  userId?: string | null;
  tenantId?: string | null;
  tenantName?: string | null;
  fullName: string;
  email: string;
  phone: string;
  role?: string | null;
  status?: string | null;
  tempPasswordSet?: boolean;
}) {
  const pool = getDbPool();
  const settings = await readInviteWebhookSettings(pool).catch(() => DEFAULT_SETTINGS);
  if (!settings.webhookUrl) {
    return { sent: false, reason: "Invite webhook URL is missing." as const };
  }

  let activationLink = "";
  if (s(input.userId)) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const token = await issueActivationToken(client, {
        userId: s(input.userId),
        context: "staff_invite",
        metadata: {
          scope: input.scope,
          tenantId: s(input.tenantId),
          tenantName: s(input.tenantName),
          email: s(input.email).toLowerCase(),
        },
      });
      await client.query("COMMIT");
      const base = s(settings.activationBaseUrl) || getDefaultActivationBaseUrl();
      activationLink = `${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const payload = {
    event: "staff.invited",
    sentAt: new Date().toISOString(),
    scope: input.scope,
    staff: {
      fullName: s(input.fullName),
      full_name: s(input.fullName),
      email: s(input.email).toLowerCase(),
      phone: s(input.phone),
      role: s(input.role),
      status: s(input.status) || "invited",
      tempPasswordSet: Boolean(input.tempPasswordSet),
    },
    tenant: {
      id: s(input.tenantId),
      name: s(input.tenantName),
    },
    activation: {
      link: activationLink || null,
      expiresInHours: 72,
    },
    fullName: s(input.fullName),
    full_name: s(input.fullName),
  };

  const res = await fetch(settings.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const responseText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Invite webhook failed (${res.status}) ${responseText.slice(0, 180)}`);
  }
  return { sent: true, status: res.status, activationLink };
}
