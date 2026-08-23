import type { Pool, PoolClient } from "pg";

import { getDbPool } from "@/lib/db";
import { issueActivationToken } from "@/lib/staffInvite";
import { normalizeStateCodes, stateNameForCode } from "@/lib/usStateOptions";

export const STATE_MANAGER_MODULES = [
  "applications",
  "partners",
  "appointments",
  "refunds",
  "contacts",
  "care",
  "analytics",
  "directory-analytics",
  "support",
] as const;

export type PartnerAdminModule = (typeof STATE_MANAGER_MODULES)[number] | "market-management" | "services" | "calendars" | "automations";
export type PartnerAdminRole = "platform_owner" | "state_market_manager";

export type PartnerAdminAccess = {
  role: PartnerAdminRole;
  status: "invited" | "active" | "suspended";
  isOwner: boolean;
  stateCodes: string[];
  stateNames: string[];
  managerCommissionRate: number;
  modules: PartnerAdminModule[];
};

function s(value: unknown) {
  return String(value ?? "").trim();
}

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const PLATFORM_OWNER_EMAIL = "ac@devasks.com";

export function ownerEmails() {
  return new Set([PLATFORM_OWNER_EMAIL]);
}

export function isPlatformOwnerEmail(email: string) {
  return ownerEmails().has(s(email).toLowerCase());
}

export function canAccessPartnerAdminModule(access: PartnerAdminAccess, module?: PartnerAdminModule) {
  return !module || access.isOwner || access.modules.includes(module);
}

export async function resolvePartnerAdminAccess(
  input: { userId: string; email: string },
  pool: Pool = getDbPool(),
): Promise<PartnerAdminAccess | null> {
  const ownerFallback = isPlatformOwnerEmail(input.email);
  try {
    const result = await pool.query<{
      role: PartnerAdminRole;
      status: PartnerAdminAccess["status"];
      manager_commission_rate: string | number;
      state_code: string | null;
      state_name: string | null;
    }>(
      `select p.role, p.status, p.manager_commission_rate, a.state_code, a.state_name
         from app.admin_access_profiles p
         left join app.admin_state_assignments a on a.manager_user_id = p.user_id
        where p.user_id = $1
        order by a.state_name asc`,
      [input.userId],
    );
    if (!result.rows.length) {
      if (!ownerFallback) return null;
      return {
        role: "platform_owner", status: "active", isOwner: true,
        stateCodes: [], stateNames: [], managerCommissionRate: 0,
        modules: ["applications", "partners", "appointments", "refunds", "contacts", "care", "analytics", "directory-analytics", "support", "market-management", "services", "calendars", "automations"],
      };
    }
    const first = result.rows[0];
    if (first.status !== "active") return null;
    const isOwner = first.role === "platform_owner" || ownerFallback;
    return {
      role: isOwner ? "platform_owner" : "state_market_manager",
      status: first.status,
      isOwner,
      stateCodes: result.rows.map((row) => s(row.state_code)).filter(Boolean),
      stateNames: result.rows.map((row) => s(row.state_name)).filter(Boolean),
      managerCommissionRate: n(first.manager_commission_rate),
      modules: isOwner
        ? ["applications", "partners", "appointments", "refunds", "contacts", "care", "analytics", "directory-analytics", "support", "market-management", "services", "calendars", "automations"]
        : [...STATE_MANAGER_MODULES],
    };
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
    if (code === "42P01" && ownerFallback) {
      return {
        role: "platform_owner", status: "active", isOwner: true,
        stateCodes: [], stateNames: [], managerCommissionRate: 0,
        modules: ["applications", "partners", "appointments", "refunds", "contacts", "care", "analytics", "directory-analytics", "support", "market-management", "services", "calendars", "automations"],
      };
    }
    throw error;
  }
}

export type StateMarketManagerRecord = {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  status: PartnerAdminAccess["status"];
  managerCommissionRate: number;
  states: Array<{ code: string; name: string }>;
  lastLoginAt: string | null;
  createdAt: string;
  completedAppointments: number;
  grossAppointmentValue: number;
  platformShareValue: number;
  earnedCommission: number;
  paidCommission: number;
  pendingCommission: number;
};

export type StateMarketManagerCommissionSummary = Pick<
  StateMarketManagerRecord,
  | "completedAppointments"
  | "grossAppointmentValue"
  | "platformShareValue"
  | "earnedCommission"
  | "paidCommission"
  | "pendingCommission"
>;

export async function getStateMarketManagerCommissionSummary(
  userId: string,
  pool: Pool = getDbPool(),
): Promise<StateMarketManagerCommissionSummary> {
  const result = await pool.query<{
    completed_appointments: string | number;
    gross_appointment_value: string | number;
    platform_share_value: string | number;
    earned_commission: string | number;
    paid_commission: string | number;
    pending_commission: string | number;
  }>(
    `select count(*) filter (where status in ('earned', 'paid')) as completed_appointments,
            coalesce(sum(service_gross_amount) filter (where status in ('earned', 'paid')), 0) as gross_appointment_value,
            coalesce(sum(service_gross_amount * platform_share_rate / 100) filter (where status in ('earned', 'paid')), 0) as platform_share_value,
            coalesce(sum(manager_commission_amount) filter (where status in ('earned', 'paid')), 0) as earned_commission,
            coalesce(sum(manager_commission_amount) filter (where status = 'paid'), 0) as paid_commission,
            coalesce(sum(manager_commission_amount) filter (where status = 'earned'), 0) as pending_commission
       from app.state_manager_commissions
      where manager_user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return {
    completedAppointments: n(row?.completed_appointments),
    grossAppointmentValue: n(row?.gross_appointment_value),
    platformShareValue: n(row?.platform_share_value),
    earnedCommission: n(row?.earned_commission),
    paidCommission: n(row?.paid_commission),
    pendingCommission: n(row?.pending_commission),
  };
}

export async function listStateMarketManagers(pool: Pool = getDbPool()) {
  const result = await pool.query<{
    user_id: string; full_name: string | null; email: string; phone: string | null;
    status: PartnerAdminAccess["status"]; manager_commission_rate: string | number;
    last_login_at: Date | string | null; created_at: Date | string;
    states: Array<{ code: string; name: string }> | null;
    completed_appointments: string | number; gross_appointment_value: string | number;
    platform_share_value: string | number; earned_commission: string | number;
    paid_commission: string | number; pending_commission: string | number;
  }>(
    `select p.user_id, u.full_name, u.email, u.phone, p.status, p.manager_commission_rate,
            u.last_login_at, p.created_at,
            coalesce(jsonb_agg(jsonb_build_object('code', a.state_code, 'name', a.state_name)
              order by a.state_name) filter (where a.id is not null), '[]'::jsonb) as states,
            finance.completed_appointments, finance.gross_appointment_value,
            finance.platform_share_value, finance.earned_commission,
            finance.paid_commission, finance.pending_commission
       from app.admin_access_profiles p
       join app.users u on u.id = p.user_id
       left join app.admin_state_assignments a on a.manager_user_id = p.user_id
       left join lateral (
         select count(*) filter (where c.status in ('earned', 'paid')) as completed_appointments,
                coalesce(sum(c.service_gross_amount) filter (where c.status in ('earned', 'paid')), 0) as gross_appointment_value,
                coalesce(sum(c.service_gross_amount * c.platform_share_rate / 100) filter (where c.status in ('earned', 'paid')), 0) as platform_share_value,
                coalesce(sum(c.manager_commission_amount) filter (where c.status in ('earned', 'paid')), 0) as earned_commission,
                coalesce(sum(c.manager_commission_amount) filter (where c.status = 'paid'), 0) as paid_commission,
                coalesce(sum(c.manager_commission_amount) filter (where c.status = 'earned'), 0) as pending_commission
           from app.state_manager_commissions c
          where c.manager_user_id = p.user_id
       ) finance on true
      where p.role = 'state_market_manager'
      group by p.user_id, u.full_name, u.email, u.phone, p.status, p.manager_commission_rate,
               u.last_login_at, p.created_at, finance.completed_appointments,
               finance.gross_appointment_value, finance.platform_share_value,
               finance.earned_commission, finance.paid_commission, finance.pending_commission
      order by u.full_name asc nulls last, u.email asc`,
  );
  return result.rows.map((row): StateMarketManagerRecord => ({
    userId: row.user_id,
    fullName: s(row.full_name),
    email: s(row.email).toLowerCase(),
    phone: s(row.phone),
    status: row.status,
    managerCommissionRate: n(row.manager_commission_rate),
    states: Array.isArray(row.states) ? row.states : [],
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    completedAppointments: n(row.completed_appointments),
    grossAppointmentValue: n(row.gross_appointment_value),
    platformShareValue: n(row.platform_share_value),
    earnedCommission: n(row.earned_commission),
    paidCommission: n(row.paid_commission),
    pendingCommission: n(row.pending_commission),
  }));
}

async function writeAssignments(client: PoolClient, userId: string, stateCodes: string[], actorUserId: string) {
  await client.query(`delete from app.admin_state_assignments where manager_user_id = $1`, [userId]);
  for (const code of stateCodes) {
    await client.query(
      `insert into app.admin_state_assignments (manager_user_id, state_code, state_name, assigned_by)
       values ($1, $2, $3, $4)`,
      [userId, code, stateNameForCode(code), actorUserId],
    );
  }
}

function isStateConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

export async function createStateMarketManager(input: {
  fullName: string; email: string; phone?: string; stateCodes: unknown;
  managerCommissionRate?: number; actorUserId: string; activationBaseUrl: string;
}) {
  const fullName = s(input.fullName);
  const email = s(input.email).toLowerCase();
  const phone = s(input.phone);
  const stateCodes = normalizeStateCodes(input.stateCodes);
  const rate = n(input.managerCommissionRate ?? 5);
  if (!fullName || !email || !email.includes("@")) throw new Error("A valid name and email are required.");
  if (isPlatformOwnerEmail(email)) throw new Error("The platform owner cannot be converted into a Market Manager.");
  if (!stateCodes.length) throw new Error("Assign at least one state.");
  if (rate < 0 || rate > 100) throw new Error("Commission must be between 0% and 100% of the platform share.");

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let user = await client.query<{ id: string }>(`select id from app.users where lower(email) = lower($1) limit 1`, [email]);
    if (!user.rows[0]) {
      user = await client.query<{ id: string }>(
        `insert into app.users (email, full_name, phone, is_active, account_status)
         values ($1, $2, nullif($3, ''), true, 'invited') returning id`,
        [email, fullName, phone],
      );
    } else {
      await client.query(
        `update app.users set full_name = $2, phone = nullif($3, ''), is_active = true where id = $1`,
        [user.rows[0].id, fullName, phone],
      );
    }
    const userId = user.rows[0].id;
    const existingAdminAccess = await client.query<{ role: PartnerAdminRole }>(
      `select role from app.admin_access_profiles where user_id = $1 for update`,
      [userId],
    );
    if (existingAdminAccess.rows[0]?.role === "platform_owner") {
      throw new Error("The platform owner cannot be converted into a Market Manager.");
    }
    await client.query(
      `insert into app.admin_access_profiles (user_id, role, status, manager_commission_rate, created_by)
       values ($1, 'state_market_manager', 'invited', $2, $3)
       on conflict (user_id) do update set role = 'state_market_manager', status = 'invited',
         manager_commission_rate = excluded.manager_commission_rate, updated_at = now()`,
      [userId, rate, input.actorUserId],
    );
    await writeAssignments(client, userId, stateCodes, input.actorUserId);
    const token = await issueActivationToken(client, {
      userId, context: "state_market_manager_invite",
      metadata: { role: "state_market_manager", stateCodes, email },
    });
    await client.query(
      `insert into app.admin_access_audit_log (actor_user_id, target_user_id, action, after_payload)
       values ($1, $2, 'state_manager.created', $3::jsonb)`,
      [input.actorUserId, userId, JSON.stringify({ fullName, email, phone, stateCodes, managerCommissionRate: rate })],
    );
    await client.query("COMMIT");
    const base = input.activationBaseUrl.replace(/\/+$/, "");
    return { userId, activationLink: `${base}?token=${encodeURIComponent(token)}` };
  } catch (error) {
    await client.query("ROLLBACK");
    if (isStateConflict(error)) throw new Error("One of these states already has a Market Manager.");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateStateMarketManager(input: {
  userId: string; fullName: string; phone?: string; stateCodes: unknown;
  managerCommissionRate?: number; status?: PartnerAdminAccess["status"]; actorUserId: string;
}) {
  const stateCodes = normalizeStateCodes(input.stateCodes);
  const rate = n(input.managerCommissionRate ?? 5);
  if (!s(input.fullName) || !stateCodes.length) throw new Error("Name and at least one state are required.");
  if (rate < 0 || rate > 100) throw new Error("Commission must be between 0% and 100% of the platform share.");
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query<{ profile: { role?: PartnerAdminRole } }>(
      `select to_jsonb(p.*) as profile
         from app.admin_access_profiles p
        where user_id = $1 and role = 'state_market_manager'
        for update`,
      [input.userId],
    );
    if (!before.rows[0]) throw new Error("Market Manager not found.");
    await client.query(`update app.users set full_name = $2, phone = nullif($3, '') where id = $1`, [input.userId, s(input.fullName), s(input.phone)]);
    await client.query(
      `update app.admin_access_profiles set manager_commission_rate = $2,
        status = coalesce($3, status), updated_at = now() where user_id = $1`,
      [input.userId, rate, input.status || null],
    );
    await writeAssignments(client, input.userId, stateCodes, input.actorUserId);
    await client.query(
      `insert into app.admin_access_audit_log (actor_user_id, target_user_id, action, before_payload, after_payload)
       values ($1, $2, 'state_manager.updated', $3::jsonb, $4::jsonb)`,
      [input.actorUserId, input.userId, JSON.stringify(before.rows[0].profile), JSON.stringify({ stateCodes, managerCommissionRate: rate, status: input.status })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (isStateConflict(error)) throw new Error("One of these states already has a Market Manager.");
    throw error;
  } finally {
    client.release();
  }
}

export async function suspendStateMarketManager(userId: string, actorUserId: string) {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`delete from app.admin_state_assignments where manager_user_id = $1`, [userId]);
    const updated = await client.query(
      `update app.admin_access_profiles set status = 'suspended', updated_at = now()
       where user_id = $1 and role = 'state_market_manager' returning user_id`,
      [userId],
    );
    if (!updated.rows[0]) throw new Error("Market Manager not found.");
    await client.query(`insert into app.admin_access_audit_log (actor_user_id, target_user_id, action) values ($1, $2, 'state_manager.suspended')`, [actorUserId, userId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
