import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getSessionSecret, readCookieFromHeader, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export type AppRole =
  | "platform_admin"
  | "agency_admin"
  | "tenant_admin"
  | "project_manager"
  | "analytics"
  | "member"
  | "owner"
  | "admin"
  | "analyst"
  | "viewer";

export type Permission =
  | "agency.read"
  | "agency.manage"
  | "tenant.read"
  | "tenant.manage"
  | "tenant.delete"
  | "staff.read"
  | "staff.manage"
  | "audit.read"
  | "project.read"
  | "project.manage";

type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  globalRoles: AppRole[];
};

type AuthSuccess = { ok: true; user: AuthUser };
type AuthFailure = { ok: false; response: NextResponse };
type AuthResult = AuthSuccess | AuthFailure;

const ALL_PERMISSIONS: Permission[] = [
  "agency.read",
  "agency.manage",
  "tenant.read",
  "tenant.manage",
  "tenant.delete",
  "staff.read",
  "staff.manage",
  "audit.read",
  "project.read",
  "project.manage",
];

const PERMISSIONS_BY_ROLE: Record<AppRole, Permission[]> = {
  platform_admin: ALL_PERMISSIONS,
  owner: ALL_PERMISSIONS,
  agency_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  tenant_admin: [
    "tenant.read",
    "tenant.manage",
    "staff.read",
    "staff.manage",
    "audit.read",
    "project.read",
    "project.manage",
  ],
  project_manager: ["tenant.read", "staff.read", "audit.read", "project.read", "project.manage"],
  analytics: ["tenant.read", "staff.read", "audit.read", "project.read"],
  analyst: ["tenant.read", "staff.read", "audit.read", "project.read"],
  viewer: ["tenant.read", "project.read"],
  member: ["tenant.read", "project.read"],
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeRole(role: string): AppRole | null {
  const r = s(role).toLowerCase();
  if (!r) return null;
  if (r === "admin") return "tenant_admin";
  if (r === "analyst") return "analytics";
  if (r === "viewer") return "member";
  if (
    r === "platform_admin" ||
    r === "agency_admin" ||
    r === "tenant_admin" ||
    r === "project_manager" ||
    r === "analytics" ||
    r === "member" ||
    r === "owner"
  ) {
    return r;
  }
  return null;
}

function uniqueRoles(roles: AppRole[]) {
  return Array.from(new Set(roles));
}

function hasPermissionFromRoles(roles: AppRole[], permission: Permission) {
  return roles.some((role) => (PERMISSIONS_BY_ROLE[role] || []).includes(permission));
}

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

function forbidden(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 403 });
}

async function resolveOrCreateUser(req: Request): Promise<AuthResult> {
  const pool = getDbPool();
  let rawUserId = s(req.headers.get("x-user-id"));
  let rawEmail = s(req.headers.get("x-user-email")).toLowerCase();
  let rawName = s(req.headers.get("x-user-name"));
  if (!rawUserId && !rawEmail) {
    const secret = getSessionSecret();
    const token = readCookieFromHeader(req.headers.get("cookie"), SESSION_COOKIE_NAME);
    if (secret && token) {
      const parsed = verifySessionToken(token, secret);
      if (parsed) {
        rawUserId = s(parsed.sub);
        rawEmail = s(parsed.email).toLowerCase();
        rawName = s(parsed.name);
      }
    }
  }
  const devEmail = s(process.env.DEV_AUTH_EMAIL).toLowerCase();
  const autoCreate = s(process.env.DEV_AUTH_AUTO_CREATE) === "1";

  const userId = rawUserId;
  const email = rawEmail || devEmail;

  if (!userId && !email) {
    return { ok: false, response: unauthorized("Missing auth headers. Send x-user-email or x-user-id.") };
  }

  const byId = !!userId;
  const query = byId
    ? `select u.id, u.email, u.full_name, u.phone, (to_jsonb(u)->>'avatar_url') as avatar_url, u.is_active from app.users u where u.id = $1 limit 1`
    : `select u.id, u.email, u.full_name, u.phone, (to_jsonb(u)->>'avatar_url') as avatar_url, u.is_active from app.users u where lower(u.email) = lower($1) limit 1`;
  const val = byId ? userId : email;
  const existing = await pool.query<{ id: string; email: string; full_name: string | null; phone: string | null; avatar_url: string | null; is_active: boolean }>(query, [val]);

  let user = existing.rows[0] || null;
  if (!user && !byId && autoCreate) {
    const inserted = await pool.query<{ id: string; email: string; full_name: string | null; phone: string | null; avatar_url: string | null; is_active: boolean }>(
      `
        insert into app.users (email, full_name, phone, is_active)
        values ($1, nullif($2, ''), null, true)
        returning id, email, full_name, phone, avatar_url, is_active
      `,
      [email, rawName],
    );
    user = inserted.rows[0] || null;
  }

  if (!user) {
    return { ok: false, response: unauthorized("User not found in app.users.") };
  }
  if (!user.is_active) {
    return { ok: false, response: forbidden("User is disabled.") };
  }

  let rolesRows: Array<{ role: string }> = [];
  try {
    const rolesQ = await pool.query<{ role: string }>(
      `
        select role
        from app.user_global_roles
        where user_id = $1
      `,
      [user.id],
    );
    rolesRows = rolesQ.rows;
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
    if (code !== "42P01") throw error;
  }
  const globalRoles = uniqueRoles(
    rolesRows
      .map((r) => normalizeRole(r.role))
      .filter((r): r is AppRole => !!r),
  );

  return {
    ok: true,
    user: {
      id: user.id,
      email: s(user.email).toLowerCase(),
      fullName: user.full_name,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      globalRoles,
    },
  };
}

export async function requireAuthUser(req: Request): Promise<AuthResult> {
  return resolveOrCreateUser(req);
}

export async function requireAgencyPermission(
  req: Request,
  permission: Extract<Permission, "agency.read" | "agency.manage">,
): Promise<AuthResult> {
  const auth = await requireAuthUser(req);
  if (!auth.ok) return auth;
  if (!hasPermissionFromRoles(auth.user.globalRoles, permission)) {
    return { ok: false, response: forbidden("Missing agency permission.") };
  }
  return auth;
}

export async function requireTenantPermission(
  req: Request,
  tenantId: string,
  permission: Exclude<Permission, "agency.read" | "agency.manage">,
): Promise<AuthResult> {
  const auth = await requireAuthUser(req);
  if (!auth.ok) return auth;

  if (hasPermissionFromRoles(auth.user.globalRoles, permission)) {
    return auth;
  }

  const pool = getDbPool();
  const tenantRolesQ = await pool.query<{ role: string }>(
    `
      select role
      from app.organization_memberships
      where organization_id = $1 and user_id = $2 and status = 'active'
      union all
      select role
      from app.organization_staff
      where organization_id = $1 and lower(email) = lower($3) and status = 'active'
    `,
    [tenantId, auth.user.id, auth.user.email],
  );

  const tenantRoles = uniqueRoles(
    tenantRolesQ.rows
      .map((r) => normalizeRole(r.role))
      .filter((r): r is AppRole => !!r),
  );
  const effectiveRoles = uniqueRoles([...auth.user.globalRoles, ...tenantRoles]);

  if (!hasPermissionFromRoles(effectiveRoles, permission)) {
    return { ok: false, response: forbidden("Missing tenant permission.") };
  }
  return auth;
}

export async function listAccessibleTenantIdsForUser(user: AuthUser): Promise<string[]> {
  const pool = getDbPool();
  const q = await pool.query<{ organization_id: string }>(
    `
      select distinct organization_id
      from (
        select organization_id
        from app.organization_memberships
        where user_id = $1 and status = 'active'
        union all
        select organization_id
        from app.organization_staff
        where lower(email) = lower($2) and status = 'active'
      ) t
    `,
    [user.id, user.email],
  );
  return q.rows.map((r) => r.organization_id).filter(Boolean);
}
