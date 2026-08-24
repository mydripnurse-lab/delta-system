import type { Pool, PoolClient } from "pg";

import { getDbPool } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
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

export type StateManagerAssignmentInput = {
  stateCode: string;
  commissionRate: number;
};

function s(value: unknown) {
  return String(value ?? "").trim();
}

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const PLATFORM_OWNER_EMAIL = "ac@devasks.com";

let stateMarketManagerSchemaReady: Promise<void> | null = null;

async function initializeStateMarketManagerSchema(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("select pg_advisory_xact_lock(hashtext('app.state_market_manager_schema_v1'))");
    await client.query(`
      create schema if not exists app;

      create table if not exists app.admin_access_profiles (
        user_id uuid primary key references app.users(id) on delete restrict,
        role text not null,
        status text not null default 'invited',
        manager_commission_rate numeric(7,4) not null default 5.0000,
        created_by uuid references app.users(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint admin_access_profiles_role_ck
          check (role in ('platform_owner', 'state_market_manager')),
        constraint admin_access_profiles_status_ck
          check (status in ('invited', 'active', 'suspended')),
        constraint admin_access_profiles_commission_ck
          check (manager_commission_rate >= 0 and manager_commission_rate <= 100)
      );

      create table if not exists app.admin_state_assignments (
        id uuid primary key default gen_random_uuid(),
        manager_user_id uuid not null references app.admin_access_profiles(user_id) on delete cascade,
        state_code text not null,
        state_name text not null,
        manager_commission_rate numeric(7,4) not null default 5.0000,
        assigned_by uuid references app.users(id) on delete set null,
        created_at timestamptz not null default now(),
        constraint admin_state_assignments_state_code_ck check (state_code ~ '^[A-Z]{2}$'),
        constraint admin_state_assignments_state_uq unique (state_code),
        constraint admin_state_assignments_manager_state_uq unique (manager_user_id, state_code)
      );
      do $schema_upgrade$
      begin
        if not exists (
          select 1 from information_schema.columns
           where table_schema = 'app' and table_name = 'admin_state_assignments'
             and column_name = 'manager_commission_rate'
        ) then
          alter table app.admin_state_assignments
            add column manager_commission_rate numeric(7,4) not null default 5.0000;
          update app.admin_state_assignments assignment
             set manager_commission_rate = profile.manager_commission_rate
            from app.admin_access_profiles profile
           where profile.user_id = assignment.manager_user_id;
        end if;
      end
      $schema_upgrade$;
      create index if not exists admin_state_assignments_manager_idx
        on app.admin_state_assignments (manager_user_id);

      create table if not exists app.state_manager_commissions (
        id uuid primary key default gen_random_uuid(),
        appointment_id uuid not null,
        manager_user_id uuid not null references app.admin_access_profiles(user_id) on delete restrict,
        state_code text not null,
        service_gross_amount numeric(14,2) not null default 0,
        platform_share_rate numeric(7,4) not null default 40.0000,
        manager_rate_of_platform_share numeric(7,4) not null default 5.0000,
        manager_commission_amount numeric(14,2) not null default 0,
        status text not null default 'pending',
        earned_at timestamptz,
        paid_at timestamptz,
        reversed_at timestamptz,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint state_manager_commissions_appointment_uq unique (appointment_id),
        constraint state_manager_commissions_state_code_ck check (state_code ~ '^[A-Z]{2}$'),
        constraint state_manager_commissions_status_ck check (status in ('pending', 'earned', 'paid', 'reversed')),
        constraint state_manager_commissions_amounts_ck check (
          service_gross_amount >= 0 and
          platform_share_rate >= 0 and platform_share_rate <= 100 and
          manager_rate_of_platform_share >= 0 and manager_rate_of_platform_share <= 100 and
          manager_commission_amount >= 0
        )
      );
      create index if not exists state_manager_commissions_manager_created_idx
        on app.state_manager_commissions (manager_user_id, created_at desc);
      create index if not exists state_manager_commissions_state_created_idx
        on app.state_manager_commissions (state_code, created_at desc);

      create table if not exists app.admin_access_audit_log (
        id uuid primary key default gen_random_uuid(),
        actor_user_id uuid references app.users(id) on delete set null,
        target_user_id uuid references app.users(id) on delete set null,
        action text not null,
        before_payload jsonb,
        after_payload jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists admin_access_audit_target_created_idx
        on app.admin_access_audit_log (target_user_id, created_at desc);

    `);
    await client.query(`
      insert into app.admin_access_profiles (user_id, role, status, manager_commission_rate)
      select id, 'platform_owner', 'active', 0
        from app.users
       where lower(email) = lower($1)
      on conflict (user_id) do update
        set role = 'platform_owner', status = 'active', updated_at = now();
    `, [PLATFORM_OWNER_EMAIL]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureStateMarketManagerSchema(pool: Pool = getDbPool()) {
  if (!stateMarketManagerSchemaReady) {
    stateMarketManagerSchemaReady = initializeStateMarketManagerSchema(pool);
  }
  try {
    await stateMarketManagerSchemaReady;
  } catch (error) {
    stateMarketManagerSchemaReady = null;
    throw error;
  }
}

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
    await ensureStateMarketManagerSchema(pool);
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
    if (ownerFallback) {
      console.warn("[state-market-managers] Falling back to platform owner access.", {
        code,
        error: error instanceof Error ? error.message : String(error),
      });
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
  states: Array<{ code: string; name: string; commissionRate: number }>;
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
  await ensureStateMarketManagerSchema(pool);
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
  await ensureStateMarketManagerSchema(pool);
  const result = await pool.query<{
    user_id: string; full_name: string | null; email: string; phone: string | null;
    status: PartnerAdminAccess["status"]; manager_commission_rate: string | number;
    last_login_at: Date | string | null; created_at: Date | string;
    states: Array<{ code: string; name: string; commissionRate: number }> | null;
    completed_appointments: string | number; gross_appointment_value: string | number;
    platform_share_value: string | number; earned_commission: string | number;
    paid_commission: string | number; pending_commission: string | number;
  }>(
    `select p.user_id, u.full_name, u.email, u.phone, p.status, p.manager_commission_rate,
            u.last_login_at, p.created_at,
            coalesce(jsonb_agg(jsonb_build_object('code', a.state_code, 'name', a.state_name, 'commissionRate', a.manager_commission_rate)
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

function normalizeAssignments(input: unknown, fallbackRate = 5): StateManagerAssignmentInput[] {
  const entries = Array.isArray(input) ? input : [];
  const normalized = entries.map((entry) => {
    if (typeof entry === "string") return { stateCode: entry, commissionRate: fallbackRate };
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return { stateCode: s(row.stateCode || row.code), commissionRate: n(row.commissionRate ?? fallbackRate) };
  });
  const codes = normalizeStateCodes(normalized.map((entry) => entry.stateCode));
  return codes.map((stateCode) => {
    const entry = normalized.find((item) => s(item.stateCode).toUpperCase() === stateCode);
    const commissionRate = n(entry?.commissionRate ?? fallbackRate);
    if (commissionRate < 0 || commissionRate > 100) {
      throw new Error(`Commission for ${stateCode} must be between 0% and 100% of the platform share.`);
    }
    return { stateCode, commissionRate };
  });
}

async function writeAssignments(client: PoolClient, userId: string, assignments: StateManagerAssignmentInput[], actorUserId: string) {
  await client.query(`delete from app.admin_state_assignments where manager_user_id = $1`, [userId]);
  for (const assignment of assignments) {
    await client.query(
      `insert into app.admin_state_assignments (manager_user_id, state_code, state_name, manager_commission_rate, assigned_by)
       values ($1, $2, $3, $4, $5)`,
      [userId, assignment.stateCode, stateNameForCode(assignment.stateCode), assignment.commissionRate, actorUserId],
    );
  }
}

function isStateConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

export async function createStateMarketManager(input: {
  fullName: string; email: string; phone?: string; assignments: unknown;
  password?: string; actorUserId: string; activationBaseUrl: string;
}) {
  const fullName = s(input.fullName);
  const email = s(input.email).toLowerCase();
  const phone = s(input.phone);
  const password = s(input.password);
  const assignments = normalizeAssignments(input.assignments);
  const stateCodes = assignments.map((assignment) => assignment.stateCode);
  if (!fullName || !email || !email.includes("@")) throw new Error("A valid name and email are required.");
  if (isPlatformOwnerEmail(email)) throw new Error("The platform owner cannot be converted into a Market Manager.");
  if (!stateCodes.length) throw new Error("Assign at least one state.");
  const passwordError = password ? validatePasswordStrength(password) : "";
  if (passwordError) throw new Error(passwordError);
  const passwordHash = password ? await hashPassword(password) : null;
  const accessStatus = passwordHash ? "active" : "invited";

  const pool = getDbPool();
  await ensureStateMarketManagerSchema(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let user = await client.query<{ id: string }>(`select id from app.users where lower(email) = lower($1) limit 1`, [email]);
    if (!user.rows[0]) {
      user = await client.query<{ id: string }>(
        `insert into app.users (email, full_name, phone, is_active, account_status, password_hash, password_updated_at)
         values ($1, $2, nullif($3, ''), true, $4, $5, case when $5::text is null then null else now() end) returning id`,
        [email, fullName, phone, accessStatus, passwordHash],
      );
    } else {
      await client.query(
        `update app.users
            set full_name = $2, phone = nullif($3, ''), is_active = true,
                account_status = $4,
                password_hash = coalesce($5, password_hash),
                password_updated_at = case when $5::text is null then password_updated_at else now() end,
                failed_login_attempts = case when $5::text is null then failed_login_attempts else 0 end,
                locked_until = case when $5::text is null then locked_until else null end
          where id = $1`,
        [user.rows[0].id, fullName, phone, accessStatus, passwordHash],
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
       values ($1, 'state_market_manager', $4, $2, $3)
       on conflict (user_id) do update set role = 'state_market_manager', status = $4,
         manager_commission_rate = excluded.manager_commission_rate, updated_at = now()`,
      [userId, assignments[0]?.commissionRate ?? 5, input.actorUserId, accessStatus],
    );
    await writeAssignments(client, userId, assignments, input.actorUserId);
    const token = passwordHash ? "" : await issueActivationToken(client, {
      userId, context: "state_market_manager_invite",
      metadata: { role: "state_market_manager", stateCodes, email },
    });
    await client.query(
      `insert into app.admin_access_audit_log (actor_user_id, target_user_id, action, after_payload)
       values ($1, $2, 'state_manager.created', $3::jsonb)`,
      [input.actorUserId, userId, JSON.stringify({ fullName, email, phone, assignments })],
    );
    await client.query("COMMIT");
    const base = input.activationBaseUrl.replace(/\/+$/, "");
    return {
      userId,
      activationLink: token ? `${base}?token=${encodeURIComponent(token)}` : "",
      passwordConfigured: Boolean(passwordHash),
      status: accessStatus,
      fullName,
      email,
      phone,
      assignments,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if (isStateConflict(error)) throw new Error("One of these states already has a Market Manager.");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateStateMarketManager(input: {
  userId: string; fullName: string; phone?: string; assignments: unknown;
  status?: PartnerAdminAccess["status"]; actorUserId: string;
}) {
  const assignments = normalizeAssignments(input.assignments);
  if (!s(input.fullName) || !assignments.length) throw new Error("Name and at least one state are required.");
  const pool = getDbPool();
  await ensureStateMarketManagerSchema(pool);
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
      [input.userId, assignments[0]?.commissionRate ?? 5, input.status || null],
    );
    await writeAssignments(client, input.userId, assignments, input.actorUserId);
    await client.query(
      `insert into app.admin_access_audit_log (actor_user_id, target_user_id, action, before_payload, after_payload)
       values ($1, $2, 'state_manager.updated', $3::jsonb, $4::jsonb)`,
      [input.actorUserId, input.userId, JSON.stringify(before.rows[0].profile), JSON.stringify({ assignments, status: input.status })],
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
  await ensureStateMarketManagerSchema(pool);
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
