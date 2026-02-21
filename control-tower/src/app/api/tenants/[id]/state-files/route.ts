import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import {
  getTenantStateFile,
  listTenantStateFiles,
} from "@/lib/tenantStateCatalogDb";
import { seedTenantStateFilesFromTemplates } from "@/lib/tenantStateTemplateSeed";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

type RegenerateBody = {
  rootDomain?: string;
};

type UpdateStateBody = {
  state?: string;
  stateSlug?: string;
  stateName?: string;
  payload?: Record<string, unknown>;
  jsonPath?: string | Array<string | number>;
  value?: unknown;
};

function asPlainObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function isDangerousPathToken(v: string) {
  return v === "__proto__" || v === "prototype" || v === "constructor";
}

function parseJsonPath(input: string | Array<string | number> | undefined) {
  if (Array.isArray(input)) {
    const out: Array<string | number> = [];
    for (const part of input) {
      if (typeof part === "number" && Number.isInteger(part) && part >= 0) {
        out.push(part);
        continue;
      }
      const token = s(part);
      if (!token) continue;
      if (/^\d+$/.test(token)) out.push(Number(token));
      else out.push(token);
    }
    return out;
  }

  const raw = s(input);
  if (!raw) return [];
  const normalized = raw.replace(/\[(\d+)\]/g, ".$1");
  return normalized
    .split(".")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (/^\d+$/.test(x) ? Number(x) : x));
}

function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function applyValueAtPath(
  root: Record<string, unknown>,
  pathParts: Array<string | number>,
  value: unknown,
): { ok: boolean; error?: string } {
  if (!pathParts.length) return { ok: false, error: "jsonPath is empty" };
  for (const token of pathParts) {
    if (typeof token === "string" && isDangerousPathToken(token)) {
      return { ok: false, error: `Invalid jsonPath token: ${token}` };
    }
  }

  let cursor: unknown = root;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    const key = pathParts[i];
    const next = pathParts[i + 1];

    if (typeof key === "number") {
      if (!Array.isArray(cursor)) return { ok: false, error: `Path segment ${i} expects array` };
      if (!Number.isInteger(key) || key < 0) return { ok: false, error: `Invalid array index at ${i}` };
      const arr = cursor as unknown[];
      if (arr[key] === undefined) {
        arr[key] = typeof next === "number" ? [] : {};
      }
      if (arr[key] === null || typeof arr[key] !== "object") {
        return { ok: false, error: `Cannot descend into non-object at index ${key}` };
      }
      cursor = arr[key];
      continue;
    }

    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return { ok: false, error: `Path segment ${i} expects object` };
    }
    const obj = cursor as Record<string, unknown>;
    if (obj[key] === undefined) {
      obj[key] = typeof next === "number" ? [] : {};
    }
    if (obj[key] === null || typeof obj[key] !== "object") {
      return { ok: false, error: `Cannot descend into non-object at key ${key}` };
    }
    cursor = obj[key];
  }

  const last = pathParts[pathParts.length - 1];
  if (typeof last === "number") {
    if (!Array.isArray(cursor)) return { ok: false, error: "Final path expects array" };
    if (!Number.isInteger(last) || last < 0) return { ok: false, error: "Invalid final array index" };
    (cursor as unknown[])[last] = value;
    return { ok: true };
  }

  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
    return { ok: false, error: "Final path expects object" };
  }
  (cursor as Record<string, unknown>)[last] = value;
  return { ok: true };
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }

  const pool = getDbPool();
  const exists = await pool.query(`select 1 from app.organizations where id = $1 limit 1`, [tenantId]);
  if (!exists.rows[0]) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const url = new URL(req.url);
    const state = s(url.searchParams.get("state")).toLowerCase();
    if (state) {
      const row = await getTenantStateFile(pool, tenantId, state);
      if (!row) {
        return NextResponse.json(
          { ok: false, error: `State file not found for slug: ${state}` },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        tenantId,
        stateSlug: state,
        row,
      });
    }

    const rows = await listTenantStateFiles(pool, tenantId);
    return NextResponse.json({
      ok: true,
      tenantId,
      total: rows.length,
      rows,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list tenant state files";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as RegenerateBody | null;
  const rootDomainOverride = s(body?.rootDomain);
  const pool = getDbPool();

  const tenantQ = await pool.query<{
    id: string;
    root_domain: string | null;
  }>(
    `
      select o.id, s.root_domain
      from app.organizations o
      left join app.organization_settings s on s.organization_id = o.id
      where o.id = $1
      limit 1
    `,
    [tenantId],
  );
  const tenant = tenantQ.rows[0];
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const rootDomain = rootDomainOverride || s(tenant.root_domain);
  if (!rootDomain) {
    return NextResponse.json(
      { ok: false, error: "Tenant has no rootDomain. Set organization_settings.root_domain first." },
      { status: 400 },
    );
  }

  try {
    const seeded = await seedTenantStateFilesFromTemplates({
      db: pool,
      organizationId: tenantId,
      rootDomain,
      source: "template_seed_manual",
    });

    return NextResponse.json({
      ok: seeded.ok,
      tenantId,
      rootDomain,
      seeded,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to regenerate tenant state files";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as UpdateStateBody | null;
  const url = new URL(req.url);
  const stateSlug = s(
    url.searchParams.get("state") || body?.state || body?.stateSlug,
  ).toLowerCase();
  const nextStateName = s(body?.stateName);
  const nextPayload = asPlainObject(body?.payload);
  const pathParts = parseJsonPath(body?.jsonPath);
  const wantsPathPatch = pathParts.length > 0;
  const hasPathValue = body ? Object.prototype.hasOwnProperty.call(body, "value") : false;

  if (!stateSlug) {
    return NextResponse.json(
      { ok: false, error: "Missing state slug. Use ?state=florida or body.stateSlug." },
      { status: 400 },
    );
  }
  if (!nextStateName && !nextPayload && !wantsPathPatch) {
    return NextResponse.json(
      { ok: false, error: "Nothing to update. Provide payload, stateName, or jsonPath+value." },
      { status: 400 },
    );
  }
  if (body?.payload !== undefined && !nextPayload) {
    return NextResponse.json(
      { ok: false, error: "payload must be a JSON object (not array)." },
      { status: 400 },
    );
  }
  if (wantsPathPatch && !hasPathValue) {
    return NextResponse.json(
      { ok: false, error: "When using jsonPath, include value." },
      { status: 400 },
    );
  }

  const pool = getDbPool();
  const exists = await pool.query(`select 1 from app.organizations where id = $1 limit 1`, [tenantId]);
  if (!exists.rows[0]) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const current = await getTenantStateFile(pool, tenantId, stateSlug);
    if (!current) {
      return NextResponse.json(
        { ok: false, error: `State file not found for slug: ${stateSlug}` },
        { status: 404 },
      );
    }

    let finalPayload: Record<string, unknown> | null = null;
    let patchedPath: Array<string | number> | null = null;
    if (wantsPathPatch) {
      const basePayload = cloneJson(current.payload || {});
      const patched = applyValueAtPath(basePayload, pathParts, body?.value);
      if (!patched.ok) {
        return NextResponse.json({ ok: false, error: patched.error || "Invalid jsonPath" }, { status: 400 });
      }
      finalPayload = basePayload;
      patchedPath = pathParts;
    }

    const update = await pool.query(
      `
        update app.organization_state_files
        set
          state_name = coalesce($3, state_name),
          payload = coalesce($4::jsonb, payload),
          source = 'manual_patch_api',
          updated_at = now()
        where organization_id = $1
          and state_slug = $2
        returning
          id,
          organization_id,
          state_slug,
          state_name,
          payload,
          root_domain,
          source,
          generated_at,
          created_at,
          updated_at
      `,
      [
        tenantId,
        stateSlug,
        nextStateName || null,
        finalPayload ? JSON.stringify(finalPayload) : nextPayload ? JSON.stringify(nextPayload) : null,
      ],
    );

    const row = update.rows[0] || null;
    return NextResponse.json({
      ok: true,
      tenantId,
      stateSlug,
      row,
      previousUpdatedAt: current.updated_at,
      patchedPath,
      message: "State file updated",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update tenant state file";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
