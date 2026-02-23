import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function s(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeKind(v: unknown): "counties" | "cities" | "" {
  const x = s(v).toLowerCase();
  if (x === "counties" || x === "cities") return x;
  return "";
}

function asLogs(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => s(x)).filter(Boolean).slice(-120);
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });

  const auth = await requireTenantPermission(req, tenantId, "project.read");
  if ("response" in auth) return auth.response;

  const pool = getDbPool();
  const url = new URL(req.url);
  const status = s(url.searchParams.get("status") || "open").toLowerCase();
  const kind = normalizeKind(url.searchParams.get("kind"));
  const limitRaw = Number(url.searchParams.get("limit") || 120);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(300, Math.round(limitRaw))) : 120;

  const where: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  if (status === "open" || status === "resolved" || status === "ignored") {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (kind) {
    params.push(kind);
    where.push(`kind = $${params.length}`);
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  try {
    const q = await pool.query(
      `
        select
          id,
          tenant_id as "tenantId",
          kind,
          loc_id as "locId",
          row_name as "rowName",
          domain_url as "domainUrl",
          activation_url as "activationUrl",
          failed_step as "failedStep",
          error_message as "errorMessage",
          run_source as "runSource",
          logs,
          fail_count as "failCount",
          status,
          last_seen_at as "lastSeenAt",
          resolved_at as "resolvedAt",
          resolved_by as "resolvedBy",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from app.domain_bot_failed_runs
        where ${where.join(" and ")}
        order by last_seen_at desc
        limit ${limitParam}
      `,
      params,
    );
    return NextResponse.json({ ok: true, total: q.rowCount ?? 0, rows: q.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list domain bot failures";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });

  const auth = await requireTenantPermission(req, tenantId, "project.manage");
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const locId = s(body.locId);
  const kind = normalizeKind(body.kind);
  const event = s(body.event || "failed").toLowerCase();

  if (!locId) return NextResponse.json({ ok: false, error: "Missing locId" }, { status: 400 });
  if (!kind) return NextResponse.json({ ok: false, error: "Missing or invalid kind" }, { status: 400 });

  const pool = getDbPool();
  try {
    if (event === "resolved" || event === "ignored") {
      const status = event === "ignored" ? "ignored" : "resolved";
      const updated = await pool.query(
        `
          update app.domain_bot_failed_runs
          set
            status = $1,
            resolved_at = now(),
            resolved_by = $2,
            updated_at = now()
          where tenant_id = $3
            and kind = $4
            and loc_id = $5
            and status = 'open'
          returning id
        `,
        [status, auth.user.id, tenantId, kind, locId],
      );
      return NextResponse.json({ ok: true, updated: updated.rowCount ?? 0, status });
    }

    const rowName = s(body.rowName);
    const domainUrl = s(body.domainUrl);
    const activationUrl = s(body.activationUrl);
    const failedStep = s(body.failedStep);
    const errorMessage = s(body.errorMessage);
    const runSource = s(body.runSource || "local_extension") || "local_extension";
    const logs = asLogs(body.logs);

    if (!errorMessage) {
      return NextResponse.json({ ok: false, error: "Missing errorMessage" }, { status: 400 });
    }

    const existing = await pool.query<{ id: number }>(
      `
        select id
        from app.domain_bot_failed_runs
        where tenant_id = $1
          and kind = $2
          and loc_id = $3
          and status = 'open'
        order by last_seen_at desc
        limit 1
      `,
      [tenantId, kind, locId],
    );

    if (existing.rows[0]?.id) {
      const q = await pool.query(
        `
          update app.domain_bot_failed_runs
          set
            row_name = nullif($1, ''),
            domain_url = nullif($2, ''),
            activation_url = nullif($3, ''),
            failed_step = nullif($4, ''),
            error_message = $5,
            run_source = $6,
            logs = $7::jsonb,
            fail_count = fail_count + 1,
            last_seen_at = now(),
            resolved_at = null,
            resolved_by = null,
            updated_at = now()
          where id = $8
          returning id, fail_count as "failCount"
        `,
        [
          rowName,
          domainUrl,
          activationUrl,
          failedStep,
          errorMessage,
          runSource,
          JSON.stringify(logs),
          existing.rows[0].id,
        ],
      );
      return NextResponse.json({ ok: true, id: q.rows[0]?.id || null, failCount: q.rows[0]?.failCount || 1 });
    }

    const inserted = await pool.query(
      `
        insert into app.domain_bot_failed_runs (
          tenant_id, kind, loc_id, row_name, domain_url, activation_url, failed_step,
          error_message, run_source, logs, fail_count, status, last_seen_at
        )
        values ($1, $2, $3, nullif($4, ''), nullif($5, ''), nullif($6, ''), nullif($7, ''), $8, $9, $10::jsonb, 1, 'open', now())
        returning id, fail_count as "failCount"
      `,
      [
        tenantId,
        kind,
        locId,
        rowName,
        domainUrl,
        activationUrl,
        failedStep,
        errorMessage,
        runSource,
        JSON.stringify(logs),
      ],
    );

    return NextResponse.json({ ok: true, id: inserted.rows[0]?.id || null, failCount: inserted.rows[0]?.failCount || 1 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to write domain bot failure";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });

  const auth = await requireTenantPermission(req, tenantId, "project.manage");
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const recordId = Number(body.id);
  const action = s(body.action).toLowerCase();
  if (!Number.isFinite(recordId) || recordId <= 0) {
    return NextResponse.json({ ok: false, error: "Missing or invalid id" }, { status: 400 });
  }
  if (!["resolve", "ignore", "reopen"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }

  const nextStatus = action === "resolve" ? "resolved" : action === "ignore" ? "ignored" : "open";

  const pool = getDbPool();
  try {
    const q = await pool.query(
      `
        update app.domain_bot_failed_runs
        set
          status = $1,
          resolved_at = case when $1 = 'open' then null else now() end,
          resolved_by = case when $1 = 'open' then null else $2 end,
          updated_at = now(),
          last_seen_at = case when $1 = 'open' then now() else last_seen_at end
        where tenant_id = $3
          and id = $4
        returning id, status
      `,
      [nextStatus, auth.user.id, tenantId, recordId],
    );
    if (!q.rows[0]) {
      return NextResponse.json({ ok: false, error: "Failure row not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id: q.rows[0].id, status: q.rows[0].status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update domain bot failure";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
