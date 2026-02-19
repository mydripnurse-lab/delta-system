import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

type StaffBody = {
  fullName?: string;
  email?: string;
  phone?: string;
  role?:
    | "owner"
    | "admin"
    | "analyst"
    | "viewer"
    | "agency_admin"
    | "tenant_admin"
    | "project_manager"
    | "analytics"
    | "member";
  status?: "active" | "invited" | "disabled";
};

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query(`select 1 from app.organizations where id = $1 limit 1`, [tenantId]);
  return !!q.rows[0];
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(_req, tenantId, "staff.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const pool = getDbPool();
  const q = await pool.query(
    `
      select
        id,
        organization_id as "organizationId",
        full_name as "fullName",
        email,
        phone,
        role,
        status,
        invited_at as "invitedAt",
        joined_at as "joinedAt",
        last_active_at as "lastActiveAt",
        metadata,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from app.organization_staff
      where organization_id = $1
      order by created_at desc
    `,
    [tenantId],
  );
  return NextResponse.json({ ok: true, total: q.rowCount ?? 0, rows: q.rows });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "staff.manage");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as StaffBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const fullName = s(body.fullName);
  const email = s(body.email).toLowerCase();
  const phone = s(body.phone);
  const role = s(body.role || "viewer").toLowerCase();
  const status = s(body.status || "invited").toLowerCase();

  if (!fullName || !email || !phone) {
    return NextResponse.json({ ok: false, error: "fullName, email and phone are required" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = await client.query<{ id: string }>(
      `
        insert into app.organization_staff (
          organization_id, full_name, email, phone, role, status, invited_at
        )
        values ($1, $2, $3, $4, $5, $6, case when $6 = 'invited' then now() else null end)
        returning id
      `,
      [tenantId, fullName, email, phone, role, status],
    );

    await writeAuditLog(client, {
      organizationId: tenantId,
      actorType: "user",
      actorLabel: "agency-ui",
      action: "staff.create",
      entityType: "staff",
      entityId: q.rows[0]?.id || null,
      payload: { fullName, email, phone, role, status },
    });

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      id: q.rows[0]?.id || null,
      fullName,
      email,
      phone,
      role,
      status,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to create staff member";
    const duplicate = message.toLowerCase().includes("organization_staff_org_email_lower_uq");
    return NextResponse.json({ ok: false, error: duplicate ? "Email already exists in this project." : message }, { status: duplicate ? 409 : 500 });
  } finally {
    client.release();
  }
}
