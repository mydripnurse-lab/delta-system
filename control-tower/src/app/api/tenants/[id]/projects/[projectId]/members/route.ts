import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string; projectId: string }> };

type AssignMemberBody = {
  userId?: string;
  email?: string;
  fullName?: string;
  role?: "tenant_admin" | "project_manager" | "analytics" | "member";
  status?: "active" | "invited" | "disabled";
};

async function resolveProject(pool: ReturnType<typeof getDbPool>, tenantId: string, projectId: string) {
  const p = await pool.query<{ id: string }>(
    `
      select id
      from app.projects
      where id = $1 and organization_id = $2
      limit 1
    `,
    [projectId, tenantId],
  );
  return p.rows[0] || null;
}

export async function GET(req: Request, ctx: Ctx) {
  const { id, projectId } = await ctx.params;
  const tenantId = s(id);
  const pid = s(projectId);
  if (!tenantId || !pid) {
    return NextResponse.json({ ok: false, error: "Missing tenant or project id" }, { status: 400 });
  }

  const auth = await requireTenantPermission(req, tenantId, "project.read");
  if ("response" in auth) return auth.response;

  const pool = getDbPool();
  const project = await resolveProject(pool, tenantId, pid);
  if (!project) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });

  try {
    const q = await pool.query(
      `
        select
          pm.id,
          pm.project_id as "projectId",
          pm.organization_id as "organizationId",
          pm.user_id as "userId",
          u.email as "email",
          u.full_name as "fullName",
          pm.role,
          pm.status,
          pm.created_at as "createdAt",
          pm.updated_at as "updatedAt"
        from app.project_memberships pm
        join app.users u on u.id = pm.user_id
        where pm.organization_id = $1 and pm.project_id = $2
        order by pm.created_at desc
      `,
      [tenantId, pid],
    );
    return NextResponse.json({ ok: true, total: q.rowCount ?? 0, rows: q.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list project members";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id, projectId } = await ctx.params;
  const tenantId = s(id);
  const pid = s(projectId);
  if (!tenantId || !pid) {
    return NextResponse.json({ ok: false, error: "Missing tenant or project id" }, { status: 400 });
  }

  const auth = await requireTenantPermission(req, tenantId, "project.manage");
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as AssignMemberBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const role = s(body.role || "member").toLowerCase();
  const status = s(body.status || "active").toLowerCase();
  if (!["tenant_admin", "project_manager", "analytics", "member"].includes(role)) {
    return NextResponse.json({ ok: false, error: "Invalid role" }, { status: 400 });
  }
  if (!["active", "invited", "disabled"].includes(status)) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }

  const pool = getDbPool();
  const project = await resolveProject(pool, tenantId, pid);
  if (!project) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });

  const requestedUserId = s(body.userId);
  const requestedEmail = s(body.email).toLowerCase();
  if (!requestedUserId && !requestedEmail) {
    return NextResponse.json({ ok: false, error: "Provide userId or email" }, { status: 400 });
  }

  try {
    const byId = !!requestedUserId;
    const userQ = await pool.query<{ id: string; email: string }>(
      byId
        ? `select id, email from app.users where id = $1 limit 1`
        : `select id, email from app.users where lower(email) = lower($1) limit 1`,
      [byId ? requestedUserId : requestedEmail],
    );

    let user = userQ.rows[0] || null;
    if (!user && !byId && s(process.env.DEV_AUTH_AUTO_CREATE) === "1") {
      const inserted = await pool.query<{ id: string; email: string }>(
        `
          insert into app.users (email, full_name, is_active)
          values ($1, nullif($2, ''), true)
          returning id, email
        `,
        [requestedEmail, s(body.fullName)],
      );
      user = inserted.rows[0] || null;
    }

    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const q = await pool.query<{ id: string }>(
      `
        insert into app.project_memberships (project_id, organization_id, user_id, role, status)
        values ($1, $2, $3, $4, $5)
        on conflict (project_id, user_id)
        do update set role = excluded.role, status = excluded.status
        returning id
      `,
      [pid, tenantId, user.id, role, status],
    );
    return NextResponse.json({ ok: true, id: q.rows[0]?.id || null, userId: user.id, role, status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to assign project member";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

