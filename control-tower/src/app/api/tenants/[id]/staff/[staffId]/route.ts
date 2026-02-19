import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string; staffId: string }> };

type StaffPatchBody = {
  fullName?: string;
  email?: string;
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

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, staffId } = await ctx.params;
  const tenantId = s(id);
  const memberId = s(staffId);
  if (!tenantId || !memberId) {
    return NextResponse.json({ ok: false, error: "Missing tenant or staff id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(req, tenantId, "staff.manage");
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as StaffPatchBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const fullName = s(body.fullName);
  const email = s(body.email).toLowerCase();
  const role = s(body.role).toLowerCase();
  const status = s(body.status).toLowerCase();

  const set: string[] = [];
  const vals: unknown[] = [tenantId, memberId];
  if (fullName) {
    vals.push(fullName);
    set.push(`full_name = $${vals.length}`);
  }
  if (email) {
    vals.push(email);
    set.push(`email = $${vals.length}`);
  }
  if (role) {
    vals.push(role);
    set.push(`role = $${vals.length}`);
  }
  if (status) {
    vals.push(status);
    set.push(`status = $${vals.length}`);
    if (status === "active") set.push(`joined_at = coalesce(joined_at, now())`);
  }
  if (set.length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const q = await client.query(
      `
        update app.organization_staff
        set ${set.join(", ")}
        where organization_id = $1 and id = $2
        returning id
      `,
      vals,
    );
    if (!q.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
    }

    await writeAuditLog(client, {
      organizationId: tenantId,
      actorType: "user",
      actorLabel: "agency-ui",
      action: "staff.update",
      entityType: "staff",
      entityId: memberId,
      payload: { fullName, email, role, status },
    });

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: memberId });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to update staff member";
    const duplicate = message.toLowerCase().includes("organization_staff_org_email_lower_uq");
    return NextResponse.json(
      { ok: false, error: duplicate ? "Email already exists in this project." : message },
      { status: duplicate ? 409 : 500 },
    );
  } finally {
    client.release();
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, staffId } = await ctx.params;
  const tenantId = s(id);
  const memberId = s(staffId);
  if (!tenantId || !memberId) {
    return NextResponse.json({ ok: false, error: "Missing tenant or staff id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(_req, tenantId, "staff.manage");
  if ("response" in auth) return auth.response;

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = await client.query(
      `
        delete from app.organization_staff
        where organization_id = $1 and id = $2
        returning id, email, full_name
      `,
      [tenantId, memberId],
    );
    if (!q.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
    }

    await writeAuditLog(client, {
      organizationId: tenantId,
      actorType: "user",
      actorLabel: "agency-ui",
      action: "staff.delete",
      entityType: "staff",
      entityId: memberId,
      severity: "warning",
      payload: {
        email: q.rows[0].email,
        fullName: q.rows[0].full_name,
      },
    });
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, deleted: true, id: memberId });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to delete staff member";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
