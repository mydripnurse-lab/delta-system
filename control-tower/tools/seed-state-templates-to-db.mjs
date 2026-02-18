import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTROL_TOWER_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(CONTROL_TOWER_ROOT, "..");
const TEMPLATE_DIR = path.join(REPO_ROOT, "resources", "statesFiles");
const ENV_FILES = [
  path.join(CONTROL_TOWER_ROOT, ".env.local"),
  path.join(CONTROL_TOWER_ROOT, ".env"),
];

function s(v) {
  return String(v ?? "").trim();
}

function parseArgs(argv) {
  const out = {
    tenantId: "",
    rootDomain: "",
    allTenants: false,
    source: "template_seed_cli",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = s(argv[i]);
    if (!a.startsWith("--")) continue;
    const [k, v] = a.includes("=") ? a.split(/=(.*)/s).slice(0, 2) : [a, s(argv[i + 1])];
    const takeNext = !a.includes("=") && v && !v.startsWith("--");
    if (k === "--tenant-id" || k === "--tenant") out.tenantId = s(v);
    if (k === "--root-domain" || k === "--domain") out.rootDomain = s(v);
    if (k === "--source") out.source = s(v) || out.source;
    if (k === "--all-tenants" || k === "--all") out.allTenants = true;
    if (k === "--dry-run") out.dryRun = true;
    if (takeNext) i += 1;
  }
  return out;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;
  const key = trimmed.slice(0, idx).trim();
  if (!key) return null;
  let value = trimmed.slice(idx + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

async function loadLocalEnvFiles() {
  for (const filePath of ENV_FILES) {
    const raw = await fs.readFile(filePath, "utf8").catch(() => "");
    if (!raw) continue;
    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }
}

function normalizeRootDomain(raw) {
  return s(raw).replace(/^https?:\/\//i, "").replace(/\/+$/g, "").toLowerCase();
}

function replaceTemplateDomain(input, rootDomain) {
  return input.replace(/mynewbrand\.com/gi, rootDomain);
}

function mapJsonWithDomain(node, rootDomain) {
  if (typeof node === "string") return replaceTemplateDomain(node, rootDomain);
  if (Array.isArray(node)) return node.map((x) => mapJsonWithDomain(x, rootDomain));
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = mapJsonWithDomain(v, rootDomain);
  return out;
}

function toStateSlug(fileName) {
  return s(fileName).replace(/\.json$/i, "").toLowerCase();
}

function toStateNameFromSlug(slug) {
  return s(slug)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

async function loadTemplateRows(rootDomain) {
  const entries = await fs.readdir(TEMPLATE_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  const rows = [];
  for (const fileName of files) {
    const abs = path.join(TEMPLATE_DIR, fileName);
    const raw = await fs.readFile(abs, "utf8");
    const parsed = JSON.parse(raw);
    const mapped = mapJsonWithDomain(parsed, rootDomain);
    const stateSlug = toStateSlug(fileName);
    const stateName = s(mapped?.stateName) || toStateNameFromSlug(stateSlug);
    rows.push({ stateSlug, stateName, payload: mapped });
  }
  return rows;
}

async function resolveTargets(pool, args) {
  if (args.allTenants) {
    const q = await pool.query(
      `
        select
          o.id as tenant_id,
          s.root_domain
        from app.organizations o
        left join app.organization_settings s on s.organization_id = o.id
        order by o.created_at asc
      `,
    );
    return q.rows
      .map((r) => ({
        tenantId: s(r.tenant_id),
        rootDomain: normalizeRootDomain(r.root_domain),
      }))
      .filter((x) => x.tenantId && x.rootDomain);
  }

  const tenantId = s(args.tenantId);
  if (!tenantId) throw new Error("Missing --tenant-id (or use --all-tenants).");
  const rootFromArg = normalizeRootDomain(args.rootDomain);
  if (rootFromArg) return [{ tenantId, rootDomain: rootFromArg }];

  const q = await pool.query(
    `
      select root_domain
      from app.organization_settings
      where organization_id = $1
      limit 1
    `,
    [tenantId],
  );
  const rootDomain = normalizeRootDomain(q.rows[0]?.root_domain);
  if (!rootDomain) {
    throw new Error(`Tenant ${tenantId} has no root_domain. Pass --root-domain or set it in DB.`);
  }
  return [{ tenantId, rootDomain }];
}

async function upsertRowsForTenant(pool, { tenantId, rootDomain, rows, source, dryRun }) {
  if (dryRun) {
    return { ok: true, upserted: rows.length, tenantId, rootDomain, dryRun: true };
  }
  let upserted = 0;
  for (const row of rows) {
    await pool.query(
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
      [tenantId, row.stateSlug, row.stateName, JSON.stringify(row.payload), rootDomain, source],
    );
    upserted += 1;
  }
  return { ok: true, upserted, tenantId, rootDomain, dryRun: false };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadLocalEnvFiles();
  const databaseUrl = s(process.env.DATABASE_URL);
  if (!databaseUrl) throw new Error("Missing DATABASE_URL env var.");

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const targets = await resolveTargets(pool, args);
    if (!targets.length) {
      console.log("[seed-state-templates-to-db] No tenants to process.");
      return;
    }

    console.log(`[seed-state-templates-to-db] templateDir=${TEMPLATE_DIR}`);
    console.log(`[seed-state-templates-to-db] targets=${targets.length} dryRun=${args.dryRun ? "yes" : "no"}`);

    let totalUpserted = 0;
    for (const target of targets) {
      const rows = await loadTemplateRows(target.rootDomain);
      const res = await upsertRowsForTenant(pool, {
        tenantId: target.tenantId,
        rootDomain: target.rootDomain,
        rows,
        source: args.source,
        dryRun: args.dryRun,
      });
      totalUpserted += Number(res.upserted || 0);
      console.log(
        `[seed-state-templates-to-db] tenant=${target.tenantId} domain=${target.rootDomain} upserted=${res.upserted}${res.dryRun ? " (dry-run)" : ""}`,
      );
    }

    console.log(`[seed-state-templates-to-db] done totalUpserted=${totalUpserted}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[seed-state-templates-to-db] ERROR: ${msg}`);
  process.exit(1);
});

