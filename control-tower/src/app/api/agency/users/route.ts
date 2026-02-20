import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireAuthUser } from "@/lib/authz";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { sendStaffInviteWebhook } from "@/lib/staffInvite";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function canManageAgency(globalRoles: string[]) {
  return globalRoles.some((role) => ["platform_admin", "owner", "agency_admin", "admin"].includes(s(role).toLowerCase()));
}

function normalizeGlobalRole(role: unknown) {
  const r = s(role).toLowerCase();
  if (r === "platform_admin" || r === "agency_admin" || r === "analytics") return r;
  return "";
}

type CreateAgencyUserBody = {
  email?: string;
  fullName?: string;
  phone?: string;
  password?: string;
  isActive?: boolean;
  globalRoles?: string[];
};

export async function GET(req: Request) {
  const auth = await requireAuthUser(req);
  if ("response" in auth) return auth.response;

  const pool = getDbPool();
  const isAgencyManager = canManageAgency(auth.user.globalRoles);

  const where = isAgencyManager
    ? ""
    : "where u.id = $1 or exists (select 1 from app.organization_memberships me join app.organization_memberships other on other.organization_id = me.organization_id where me.user_id = $1 and me.status = 'active' and other.user_id = u.id and other.status = 'active')";
  const vals: unknown[] = isAgencyManager ? [] : [auth.user.id];

  try {
    const q = await pool.query<{
      id: string;
      email: string;
      fullName: string | null;
      phone: string | null;
      isActive: boolean;
      createdAt: string;
      lastLoginAt: string | null;
      globalRoles: string[];
      tenantCount: number;
    }>(
      `
        select
          u.id,
          u.email,
          u.full_name as "fullName",
          u.phone,
          u.is_active as "isActive",
          u.created_at::text as "createdAt",
          u.last_login_at::text as "lastLoginAt",
          coalesce(array_remove(array_agg(distinct ugr.role), null), '{}') as "globalRoles",
          coalesce(count(distinct om.organization_id), 0)::int as "tenantCount"
        from app.users u
        left join app.user_global_roles ugr
          on ugr.user_id = u.id
        left join app.organization_memberships om
          on om.user_id = u.id
         and om.status = 'active'
        ${where}
        group by u.id
        order by u.created_at desc
      `,
      vals,
    );
    return NextResponse.json({ ok: true, rows: q.rows, canManageAgency: isAgencyManager });
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
    if (code !== "42703" && code !== "42P01") {
      const message = error instanceof Error ? error.message : "Failed to load agency users";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
    const fallback = await pool.query<{
      id: string;
      email: string;
      fullName: string | null;
      isActive: boolean;
      createdAt: string;
      tenantCount: number;
    }>(
      `
        select
          u.id,
          u.email,
          u.full_name as "fullName",
          u.is_active as "isActive",
          u.created_at::text as "createdAt",
          coalesce(count(distinct om.organization_id), 0)::int as "tenantCount"
        from app.users u
        left join app.organization_memberships om
          on om.user_id = u.id
         and om.status = 'active'
        ${where}
        group by u.id
        order by u.created_at desc
      `,
      vals,
    );
    return NextResponse.json({
      ok: true,
      rows: fallback.rows.map((row) => ({ ...row, phone: null, lastLoginAt: null, globalRoles: [] })),
      canManageAgency: isAgencyManager,
    });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuthUser(req);
  if ("response" in auth) return auth.response;
  if (!canManageAgency(auth.user.globalRoles)) {
    return NextResponse.json({ ok: false, error: "Missing agency permission." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as CreateAgencyUserBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const email = s(body.email).toLowerCase();
  const fullName = s(body.fullName);
  const phone = s(body.phone);
  const password = s(body.password);
  const isActive = body.isActive !== false;
  const roleSet = Array.from(new Set((Array.isArray(body.globalRoles) ? body.globalRoles : []).map(normalizeGlobalRole).filter(Boolean)));

  if (!email || !phone) {
    return NextResponse.json({ ok: false, error: "Email and phone are required." }, { status: 400 });
  }
  if (password) {
    const weakReason = validatePasswordStrength(password);
    if (weakReason) {
      return NextResponse.json({ ok: false, error: weakReason }, { status: 400 });
    }
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const nextHash = password ? await hashPassword(password) : null;
    let created: { rows: Array<{ id: string }> };
    try {
      created = await client.query<{ id: string }>(
        `
          insert into app.users (email, full_name, phone, is_active, password_hash, password_updated_at)
          values ($1, nullif($2, ''), nullif($3, ''), $4, $5, case when $5 is null then null else now() end)
          returning id
        `,
        [email, fullName, phone, isActive, nextHash],
      );
    } catch (error: unknown) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
      if (code !== "42703") throw error;
      try {
        created = await client.query<{ id: string }>(
          `
            insert into app.users (email, full_name, phone, is_active)
            values ($1, nullif($2, ''), nullif($3, ''), $4)
            returning id
          `,
          [email, fullName, phone, isActive],
        );
      } catch {
        created = await client.query<{ id: string }>(
          `
            insert into app.users (email, full_name, is_active)
            values ($1, nullif($2, ''), $3)
            returning id
          `,
          [email, fullName, isActive],
        );
      }
    }
    const userId = created.rows[0]?.id;
    if (!userId) throw new Error("Failed to create user.");

    if (roleSet.length > 0) {
      for (const role of roleSet) {
        await client.query(
          `
            insert into app.user_global_roles (user_id, role)
            values ($1, $2)
            on conflict (user_id, role) do nothing
          `,
          [userId, role],
        );
      }
    }

    await client.query("COMMIT");
    const inviteDelivery = await sendStaffInviteWebhook({
      scope: "agency",
      userId,
      invitedByName: auth.user.fullName || auth.user.email,
      invitedByEmail: auth.user.email,
      fullName,
      email,
      phone,
      role: roleSet[0] || "",
      status: isActive ? "active" : "disabled",
      tempPasswordSet: !!password,
    }).catch((error: unknown) => ({
      sent: false,
      reason: error instanceof Error ? error.message : "Invite webhook failed",
    }));

    return NextResponse.json({ ok: true, id: userId, inviteDelivery });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to create user";
    const duplicate = message.toLowerCase().includes("users_email_lower_uq");
    return NextResponse.json(
      { ok: false, error: duplicate ? "Email already exists." : message },
      { status: duplicate ? 409 : 500 },
    );
  } finally {
    client.release();
  }
}
