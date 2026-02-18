import fs from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function isJsonFile(name: string) {
  return name.toLowerCase().endsWith(".json");
}

function toStateSlug(fileName: string) {
  return fileName.replace(/\.json$/i, "").trim().toLowerCase();
}

type JsonObject = Record<string, unknown>;

export type TenantStateFileRow = {
  id: string;
  organization_id: string;
  state_slug: string;
  state_name: string;
  payload: JsonObject;
  root_domain: string | null;
  source: string;
  generated_at: string;
  created_at: string;
  updated_at: string;
};

export type TenantStateFilesPersistResult = {
  ok: boolean;
  upserted: number;
  outputDir: string;
  message: string;
  errors: string[];
};

type TenantStatePayloadRow = {
  stateSlug: string;
  stateName: string;
  payload: JsonObject;
};

async function readStateFilesFromDir(outputDir: string) {
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && isJsonFile(e.name)).map((e) => e.name);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

export async function upsertTenantStateFilesFromDir(args: {
  db: Pool | PoolClient;
  organizationId: string;
  outputDir: string;
  rootDomain: string | null;
  source?: string;
}): Promise<TenantStateFilesPersistResult> {
  const organizationId = s(args.organizationId);
  const outputDir = s(args.outputDir);
  const rootDomain = s(args.rootDomain) || null;
  const source = s(args.source) || "generator";
  if (!organizationId) throw new Error("Missing organizationId");
  if (!outputDir) throw new Error("Missing outputDir");

  const files = await readStateFilesFromDir(outputDir);
  if (!files.length) {
    return {
      ok: false,
      upserted: 0,
      outputDir,
      message: "No state files found in outputDir",
      errors: [],
    };
  }

  const errors: string[] = [];
  let upserted = 0;

  for (const fileName of files) {
    const absPath = path.join(outputDir, fileName);
    try {
      const raw = await fs.readFile(absPath, "utf8");
      const payload = JSON.parse(raw) as JsonObject;
      const stateSlug = toStateSlug(fileName);
      const stateName = s(payload.stateName) || stateSlug;

      await args.db.query(
        `
          insert into app.organization_state_files (
            organization_id,
            state_slug,
            state_name,
            payload,
            root_domain,
            source,
            generated_at
          )
          values ($1, $2, $3, $4::jsonb, $5, $6, now())
          on conflict (organization_id, state_slug) do update
          set
            state_name = excluded.state_name,
            payload = excluded.payload,
            root_domain = excluded.root_domain,
            source = excluded.source,
            generated_at = now(),
            updated_at = now()
        `,
        [organizationId, stateSlug, stateName, JSON.stringify(payload), rootDomain, source],
      );
      upserted += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${fileName}: ${message}`);
    }
  }

  return {
    ok: errors.length === 0,
    upserted,
    outputDir,
    message:
      errors.length > 0
        ? `Upsert completed with ${errors.length} errors`
        : `Upserted ${upserted} state files`,
    errors,
  };
}

export async function upsertTenantStateFilesFromPayloads(args: {
  db: Pool | PoolClient;
  organizationId: string;
  rootDomain: string | null;
  source?: string;
  rows: TenantStatePayloadRow[];
}): Promise<TenantStateFilesPersistResult> {
  const organizationId = s(args.organizationId);
  const rootDomain = s(args.rootDomain) || null;
  const source = s(args.source) || "template_seed";
  if (!organizationId) throw new Error("Missing organizationId");
  const rows = Array.isArray(args.rows) ? args.rows : [];

  if (!rows.length) {
    return {
      ok: false,
      upserted: 0,
      outputDir: "",
      message: "No state payload rows provided",
      errors: [],
    };
  }

  const errors: string[] = [];
  let upserted = 0;

  for (const row of rows) {
    const stateSlug = s(row.stateSlug).toLowerCase();
    const stateName = s(row.stateName) || stateSlug;
    if (!stateSlug || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
      errors.push(`invalid row: ${JSON.stringify({ stateSlug, stateName })}`);
      continue;
    }
    try {
      await args.db.query(
        `
          insert into app.organization_state_files (
            organization_id,
            state_slug,
            state_name,
            payload,
            root_domain,
            source,
            generated_at
          )
          values ($1, $2, $3, $4::jsonb, $5, $6, now())
          on conflict (organization_id, state_slug) do update
          set
            state_name = excluded.state_name,
            payload = excluded.payload,
            root_domain = excluded.root_domain,
            source = excluded.source,
            generated_at = now(),
            updated_at = now()
        `,
        [organizationId, stateSlug, stateName, JSON.stringify(row.payload), rootDomain, source],
      );
      upserted += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${stateSlug}: ${message}`);
    }
  }

  return {
    ok: errors.length === 0,
    upserted,
    outputDir: "",
    message:
      errors.length > 0
        ? `Upsert completed with ${errors.length} errors`
        : `Upserted ${upserted} state payloads`,
    errors,
  };
}

export async function listTenantStateFiles(db: Pool | PoolClient, organizationId: string) {
  const orgId = s(organizationId);
  if (!orgId) throw new Error("Missing organizationId");
  const result = await db.query<TenantStateFileRow>(
    `
      select
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
      from app.organization_state_files
      where organization_id = $1
      order by state_slug asc
    `,
    [orgId],
  );
  return result.rows;
}

export async function getTenantStateFile(
  db: Pool | PoolClient,
  organizationId: string,
  stateSlug: string,
) {
  const orgId = s(organizationId);
  const slug = s(stateSlug).toLowerCase();
  if (!orgId) throw new Error("Missing organizationId");
  if (!slug) throw new Error("Missing stateSlug");
  const result = await db.query<TenantStateFileRow>(
    `
      select
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
      from app.organization_state_files
      where organization_id = $1
        and state_slug = $2
      limit 1
    `,
    [orgId, slug],
  );
  return result.rows[0] || null;
}
