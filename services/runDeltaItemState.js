import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

function loadPg() {
    try {
        return require("pg");
    } catch {}

    const fallbackFromRepoRoot = path.join(process.cwd(), "control-tower", "node_modules", "pg");
    return require(fallbackFromRepoRoot);
}

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const TENANT_ID = String(process.env.TENANT_ID || "").trim();
const ENABLED =
    String(process.env.DELTA_DB_PROGRESS_ENABLED || "1") !== "0" &&
    !!DATABASE_URL &&
    !!TENANT_ID;
const STALE_LOCK_MIN = Math.max(5, Number(process.env.DELTA_DB_LOCK_STALE_MIN || "20"));

let pool = null;
let initialized = false;
let PoolCtor = null;

function s(v) {
    return String(v ?? "").trim();
}

function norm(v) {
    return s(v)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function itemKey({ stateSlug, kind, countyName = "", cityName = "" }) {
    return [
        norm(kind),
        norm(stateSlug),
        norm(countyName),
        norm(cityName),
    ].join("|");
}

function getPool() {
    if (!ENABLED) {
        throw new Error("runDeltaItemState disabled");
    }
    if (!PoolCtor) {
        const { Pool } = loadPg();
        PoolCtor = Pool;
    }
    if (!pool) {
        pool = new PoolCtor({
            connectionString: DATABASE_URL,
            max: 6,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 10_000,
        });
    }
    return pool;
}

export function runDeltaDbEnabled() {
    return ENABLED;
}

export async function initRunDeltaItemState() {
    if (!ENABLED || initialized) return;
    const p = getPool();
    await p.query(`
      create schema if not exists app;

      create table if not exists app.run_delta_item_state (
        tenant_id text not null,
        item_key text not null,
        state_slug text not null,
        kind text not null,
        county_name text not null default '',
        city_name text not null default '',
        status text not null default 'pending',
        attempts integer not null default 0,
        run_id text null,
        locked_at timestamptz null,
        ghl_location_id text null,
        ghl_account_name text null,
        last_error text null,
        last_note text null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (tenant_id, item_key)
      );

      create index if not exists idx_run_delta_item_state_tenant_status
        on app.run_delta_item_state (tenant_id, status, updated_at desc);
    `);
    initialized = true;
}

export async function claimRunDeltaItem({
    runId,
    stateSlug,
    kind,
    countyName = "",
    cityName = "",
}) {
    if (!ENABLED) return { action: "claimed", key: itemKey({ stateSlug, kind, countyName, cityName }) };

    const key = itemKey({ stateSlug, kind, countyName, cityName });
    const p = getPool();

    await p.query(
        `
          insert into app.run_delta_item_state
            (tenant_id, item_key, state_slug, kind, county_name, city_name, status, run_id, locked_at, updated_at)
          values
            ($1, $2, $3, $4, $5, $6, 'pending', null, null, now())
          on conflict (tenant_id, item_key) do nothing
        `,
        [TENANT_ID, key, s(stateSlug), s(kind), s(countyName), s(cityName)]
    );

    const claimed = await p.query(
        `
          update app.run_delta_item_state
          set
            status = 'running',
            run_id = $3,
            locked_at = now(),
            attempts = attempts + 1,
            updated_at = now()
          where tenant_id = $1
            and item_key = $2
            and status <> 'done'
            and (
              status <> 'running'
              or coalesce(run_id, '') = $3
              or locked_at is null
              or locked_at < now() - ($4::int * interval '1 minute')
            )
          returning
            ghl_location_id,
            ghl_account_name
        `,
        [TENANT_ID, key, s(runId), STALE_LOCK_MIN]
    );
    if (claimed.rows.length > 0) {
        const row = claimed.rows[0];
        return {
            action: "claimed",
            key,
            locationId: s(row.ghl_location_id),
            accountName: s(row.ghl_account_name),
        };
    }

    const q = await p.query(
        `
          select
            status,
            run_id,
            locked_at,
            ghl_location_id,
            ghl_account_name
          from app.run_delta_item_state
          where tenant_id = $1
            and item_key = $2
          limit 1
        `,
        [TENANT_ID, key]
    );
    const row = q.rows[0];
    if (!row) return { action: "claimed", key };

    if (s(row.status) === "done") {
        return {
            action: "done",
            key,
            locationId: s(row.ghl_location_id),
            accountName: s(row.ghl_account_name),
        };
    }
    return { action: "busy", key };
}

export async function markRunDeltaItemCreated({
    key,
    locationId,
    accountName,
}) {
    if (!ENABLED || !s(key)) return;
    const p = getPool();
    await p.query(
        `
          update app.run_delta_item_state
          set
            ghl_location_id = nullif($3, ''),
            ghl_account_name = nullif($4, ''),
            updated_at = now()
          where tenant_id = $1
            and item_key = $2
        `,
        [TENANT_ID, s(key), s(locationId), s(accountName)]
    );
}

export async function markRunDeltaItemDone({
    key,
    locationId = "",
    accountName = "",
    note = "",
}) {
    if (!ENABLED || !s(key)) return;
    const p = getPool();
    await p.query(
        `
          update app.run_delta_item_state
          set
            status = 'done',
            run_id = null,
            locked_at = null,
            ghl_location_id = nullif($3, ''),
            ghl_account_name = nullif($4, ''),
            last_error = null,
            last_note = nullif($5, ''),
            updated_at = now()
          where tenant_id = $1
            and item_key = $2
        `,
        [TENANT_ID, s(key), s(locationId), s(accountName), s(note)]
    );
}

export async function markRunDeltaItemFailed({
    key,
    errorMessage = "",
}) {
    if (!ENABLED || !s(key)) return;
    const p = getPool();
    await p.query(
        `
          update app.run_delta_item_state
          set
            status = 'failed',
            run_id = null,
            locked_at = null,
            last_error = nullif($3, ''),
            updated_at = now()
          where tenant_id = $1
            and item_key = $2
        `,
        [TENANT_ID, s(key), s(errorMessage).slice(0, 1500)]
    );
}
