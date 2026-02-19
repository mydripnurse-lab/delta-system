import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ENV_FILES = [path.join(ROOT, ".env.local"), path.join(ROOT, ".env")];

function parseEnvLine(line) {
  const trimmed = String(line || "").trim();
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

async function loadEnv() {
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

function toIso(ms) {
  return new Date(ms).toISOString();
}

function rangeFromPreset(preset) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  const setDays = (days) => start.setDate(start.getDate() - Math.max(0, days - 1));
  switch (preset) {
    case "today":
      setDays(1);
      break;
    case "24h":
      start.setTime(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      setDays(7);
      break;
    case "28d":
      setDays(28);
      break;
    case "1m":
      setDays(30);
      break;
    case "3m":
      setDays(90);
      break;
    case "6m":
      setDays(180);
      break;
    case "1y":
      setDays(365);
      break;
    default:
      setDays(28);
      break;
  }
  start.setHours(0, 0, 0, 0);
  return { start: toIso(start.getTime()), end: toIso(end.getTime()) };
}

async function fetchJson(url, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const txt = await res.text();
    let data = {};
    try {
      data = JSON.parse(txt);
    } catch {
      data = { raw: txt };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 504, data: { error: String(error?.message || error) } };
  } finally {
    clearTimeout(timer);
  }
}

async function getTenantIds(dbUrl) {
  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    const q = await client.query(
      `
      select id
      from app.organizations
      where coalesce(status, 'active') <> 'archived'
      order by created_at asc
    `,
    );
    return q.rows.map((r) => String(r.id || "").trim()).filter(Boolean);
  } finally {
    client.release();
    await pool.end();
  }
}

async function run() {
  await loadEnv();
  const dbUrl = String(process.env.DATABASE_URL || "").trim();
  if (!dbUrl) {
    throw new Error("Missing DATABASE_URL");
  }
  const baseUrl = String(process.env.BACKFILL_BASE_URL || "http://localhost:3001").trim().replace(/\/+$/, "");
  const presets = String(process.env.BACKFILL_PRESETS || "7d,28d,3m,6m,1y")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const tenantIds = await getTenantIds(dbUrl);
  if (!tenantIds.length) {
    console.log("[backfill] no tenants found");
    return;
  }

  console.log(`[backfill] base=${baseUrl} tenants=${tenantIds.length} presets=${presets.join(",")}`);

  for (const tenantId of tenantIds) {
    console.log(`\n[backfill] tenant=${tenantId}`);
    for (const preset of presets) {
      const { start, end } = rangeFromPreset(preset);
      console.log(`[backfill] preset=${preset} range=${start.slice(0, 10)}..${end.slice(0, 10)}`);

      const common = new URLSearchParams({
        tenantId,
        integrationKey: "owner",
        start,
        end,
        preset,
        compare: "1",
        bust: "1",
      });

      const endpoints = [
        `/api/dashboard/calls?${common.toString()}`,
        `/api/dashboard/contacts?${common.toString()}`,
        `/api/dashboard/conversations?${common.toString()}`,
        `/api/dashboard/transactions?${common.toString()}`,
        `/api/dashboard/appointments?${common.toString()}`,
        `/api/dashboard/search-performance/join?${common.toString()}`,
        `/api/dashboard/overview?${common.toString()}&force=1`,
      ];

      for (const ep of endpoints) {
        const url = `${baseUrl}${ep}`;
        const res = await fetchJson(url);
        const ok = res.ok ? "ok" : `fail(${res.status})`;
        const err = res.ok ? "" : ` error=${String(res.data?.error || "").slice(0, 160)}`;
        console.log(`  - ${ok} ${ep}${err}`);
      }
    }
  }

  console.log("\n[backfill] done");
}

run().catch((e) => {
  console.error(`[backfill] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

