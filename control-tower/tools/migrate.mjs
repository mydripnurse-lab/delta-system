import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const ENV_FILES = [path.join(ROOT, ".env.local"), path.join(ROOT, ".env")];

function fail(message) {
  console.error(`[db:migrate] ${message}`);
  process.exit(1);
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

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  await loadLocalEnvFiles();
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    fail("Missing DATABASE_URL env var.");
  }

  const files = await listMigrationFiles();
  if (!files.length) {
    fail(`No .sql files found in ${MIGRATIONS_DIR}`);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        file_name text primary key,
        executed_at timestamptz not null default now()
      )
    `);

    for (const fileName of files) {
      const already = await client.query(
        `select 1 from public.schema_migrations where file_name = $1 limit 1`,
        [fileName],
      );
      if (already.rows[0]) {
        console.log(`[db:migrate] skip ${fileName} (already applied)`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, fileName);
      const sql = await fs.readFile(filePath, "utf8");
      if (!sql.trim()) {
        console.log(`[db:migrate] skip ${fileName} (empty file)`);
        continue;
      }

      console.log(`[db:migrate] apply ${fileName}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          `insert into public.schema_migrations (file_name, executed_at) values ($1, now())`,
          [fileName],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    const done = await client.query(
      `select file_name, executed_at from public.schema_migrations order by file_name asc`,
    );
    console.log("[db:migrate] applied migrations:");
    for (const row of done.rows) {
      console.log(`  - ${row.file_name} @ ${row.executed_at.toISOString()}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  const base = error instanceof Error ? (error.message || error.name) : String(error);
  const code = error && typeof error === "object" && "code" in error ? String(error.code || "") : "";
  const detail = [base, code ? `code=${code}` : ""].filter(Boolean).join(" ");
  const cause =
    error && typeof error === "object" && "cause" in error && error.cause
      ? ` cause=${String(error.cause)}`
      : "";
  const message = `${detail}${cause}`.trim();
  fail(message);
});
