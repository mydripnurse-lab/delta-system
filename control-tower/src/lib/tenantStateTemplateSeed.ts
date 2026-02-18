import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { upsertTenantStateFilesFromPayloads } from "@/lib/tenantStateCatalogDb";

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };
type JsonObject = { [k: string]: JsonValue };

function s(v: unknown) {
  return String(v ?? "").trim();
}

function existsSyncSafe(p: string) {
  try {
    return fsSync.existsSync(p);
  } catch {
    return false;
  }
}

function findRepoRoot(startDir: string) {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    const hasScriptsBuilds = existsSyncSafe(path.join(dir, "scripts", "src", "builds"));
    const hasResources = existsSyncSafe(path.join(dir, "resources"));
    if (hasScriptsBuilds && hasResources) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function toStateSlug(fileName: string) {
  return fileName.replace(/\.json$/i, "").trim().toLowerCase();
}

function toStateNameFromSlug(slug: string) {
  return s(slug)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function normalizeRootDomain(raw: string) {
  return s(raw).replace(/^https?:\/\//i, "").replace(/\/+$/g, "").toLowerCase();
}

function replaceTemplateDomain(input: string, rootDomain: string) {
  return input.replace(/mynewbrand\.com/gi, rootDomain);
}

function mapJsonWithDomain(node: JsonValue, rootDomain: string): JsonValue {
  if (typeof node === "string") return replaceTemplateDomain(node, rootDomain);
  if (Array.isArray(node)) return node.map((x) => mapJsonWithDomain(x, rootDomain));
  if (!node || typeof node !== "object") return node;

  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(node)) out[k] = mapJsonWithDomain(v, rootDomain);
  return out;
}

export type SeedTenantStateFilesResult = {
  ok: boolean;
  tenantId: string;
  rootDomain: string;
  templateDir: string;
  templateFiles: number;
  upserted: number;
  message: string;
  errors: string[];
};

export async function seedTenantStateFilesFromTemplates(args: {
  db: Pool | PoolClient;
  organizationId: string;
  rootDomain: string;
  source?: string;
}): Promise<SeedTenantStateFilesResult> {
  const organizationId = s(args.organizationId);
  const rootDomain = normalizeRootDomain(args.rootDomain);
  const source = s(args.source) || "template_seed";
  if (!organizationId) throw new Error("Missing organizationId");
  if (!rootDomain) throw new Error("Missing rootDomain");

  const repoRoot = findRepoRoot(process.cwd());
  const templateDir = path.join(repoRoot, "resources", "statesFiles");
  const entries = await fs.readdir(templateDir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  if (!files.length) {
    return {
      ok: false,
      tenantId: organizationId,
      rootDomain,
      templateDir,
      templateFiles: 0,
      upserted: 0,
      message: "No template state files found in resources/statesFiles",
      errors: [],
    };
  }

  const rows: Array<{ stateSlug: string; stateName: string; payload: JsonObject }> = [];
  const parseErrors: string[] = [];

  for (const fileName of files) {
    const abs = path.join(templateDir, fileName);
    try {
      const raw = await fs.readFile(abs, "utf8");
      const parsed = JSON.parse(raw) as JsonValue;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        parseErrors.push(`${fileName}: expected JSON object`);
        continue;
      }
      const stateSlug = toStateSlug(fileName);
      const mapped = mapJsonWithDomain(parsed as JsonObject, rootDomain) as JsonObject;
      const stateName = s((mapped as Record<string, unknown>).stateName) || toStateNameFromSlug(stateSlug);
      rows.push({ stateSlug, stateName, payload: mapped });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      parseErrors.push(`${fileName}: ${message}`);
    }
  }

  const persisted = await upsertTenantStateFilesFromPayloads({
    db: args.db,
    organizationId,
    rootDomain,
    source,
    rows,
  });

  const errors = parseErrors.concat(persisted.errors || []);
  return {
    ok: errors.length === 0,
    tenantId: organizationId,
    rootDomain,
    templateDir,
    templateFiles: files.length,
    upserted: persisted.upserted,
    message:
      errors.length > 0
        ? `Seeded with ${errors.length} errors`
        : `Seeded ${persisted.upserted} states from templates`,
    errors,
  };
}

