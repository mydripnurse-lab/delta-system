import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function slugify(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

type Ctx = { params: Promise<{ id: string }> };

type CreateProjectBody = {
  name?: string;
  slug?: string;
  status?: "active" | "archived" | "disabled";
  metadata?: Record<string, unknown>;
};

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });

  const auth = await requireTenantPermission(req, tenantId, "project.read");
  if (!auth.ok) return auth.response;

  const pool = getDbPool();
  try {
    const q = await pool.query(
      `
        select
          id,
          organization_id as "organizationId",
          name,
          slug,
          status,
          metadata,
          created_at as "createdAt",
          updated_at as "updatedAt"
        from app.projects
        where organization_id = $1
        order by created_at desc
      `,
      [tenantId],
    );
    return NextResponse.json({ ok: true, total: q.rowCount ?? 0, rows: q.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list projects";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });

  const auth = await requireTenantPermission(req, tenantId, "project.manage");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as CreateProjectBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const name = s(body.name);
  const slug = slugify(s(body.slug) || name);
  const status = s(body.status || "active").toLowerCase();
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  if (!name) return NextResponse.json({ ok: false, error: "Missing required field: name" }, { status: 400 });
  if (!slug) return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
  if (!["active", "archived", "disabled"].includes(status)) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }

  const pool = getDbPool();
  try {
    const q = await pool.query<{ id: string }>(
      `
        insert into app.projects (organization_id, name, slug, status, metadata)
        values ($1, $2, $3, $4, $5::jsonb)
        returning id
      `,
      [tenantId, name, slug, status, JSON.stringify(metadata)],
    );
    return NextResponse.json({ ok: true, id: q.rows[0]?.id || null, name, slug, status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create project";
    const duplicate = message.toLowerCase().includes("projects_org_slug_lower_uq");
    return NextResponse.json({ ok: false, error: duplicate ? "Project slug already exists in this tenant." : message }, { status: duplicate ? 409 : 500 });
  }
}

