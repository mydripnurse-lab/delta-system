import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { listAccessibleTenantIdsForUser, requireAuthUser } from "@/lib/authz";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireAuthUser(req);
  if ("response" in auth) return auth.response;

  const pool = getDbPool();
  const tenantIds = await listAccessibleTenantIdsForUser(auth.user);

  const tenantRows = tenantIds.length
    ? await pool.query<{
        id: string;
        name: string;
        slug: string;
        status: string;
      }>(
        `
          select id, name, slug, status
          from app.organizations
          where id = any($1::uuid[])
          order by name asc
        `,
        [tenantIds],
      )
    : { rows: [] };

  let projectRows: { rows: Array<{ id: string; organization_id: string; name: string; slug: string; status: string; my_role: string | null }> } = { rows: [] };
  if (tenantIds.length) {
    try {
      projectRows = await pool.query<{
        id: string;
        organization_id: string;
        name: string;
        slug: string;
        status: string;
        my_role: string | null;
      }>(
        `
          select
            p.id,
            p.organization_id,
            p.name,
            p.slug,
            p.status,
            pm.role as my_role
          from app.projects p
          left join app.project_memberships pm
            on pm.project_id = p.id
           and pm.user_id = $2
           and pm.status = 'active'
          where p.organization_id = any($1::uuid[])
          order by p.name asc
        `,
        [tenantIds, auth.user.id],
      );
    } catch (error: unknown) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
      if (code !== "42P01") throw error;
    }
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      fullName: auth.user.fullName,
      phone: auth.user.phone,
      avatarUrl: auth.user.avatarUrl,
      globalRoles: auth.user.globalRoles,
    },
    tenants: tenantRows.rows,
    projects: projectRows.rows.map((p) => ({
      id: p.id,
      organizationId: p.organization_id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      myRole: p.my_role,
    })),
  });
}
