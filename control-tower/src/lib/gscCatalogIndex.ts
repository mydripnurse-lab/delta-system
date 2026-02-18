import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getDbPool } from "@/lib/db";

export type GscCatalogIndex = {
  baseDir: string;
  fingerprint: string;
  byHostname: Record<string, { state: string }>;
  statesPresent: Set<string>;
};

type LoadOpts = { force?: boolean; tenantId?: string };

type TenantDbRow = {
  state_slug: string;
  state_name: string;
  payload: Record<string, unknown>;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function isHostname(x: string) {
  const v = s(x).toLowerCase();
  return !!v && v.includes(".") && !v.includes(" ") && !v.startsWith("http");
}

function hostnameFromAnyString(x: string): string | null {
  const v = s(x);
  if (!v) return null;
  try {
    if (v.startsWith("http://") || v.startsWith("https://")) {
      const u = new URL(v);
      return (u.hostname || "").toLowerCase() || null;
    }
  } catch {}
  if (isHostname(v)) return v.toLowerCase();
  return null;
}

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
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

function collectHostnamesDeep(node: unknown, out: Set<string>) {
  if (!node) return;
  if (typeof node === "string") {
    const host = hostnameFromAnyString(node);
    if (host) out.add(host);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectHostnamesDeep(x, out);
    return;
  }
  if (typeof node === "object") {
    for (const k of Object.keys(node as Record<string, unknown>)) {
      collectHostnamesDeep((node as Record<string, unknown>)[k], out);
    }
  }
}

function titleCaseStateFromSlug(slug: string) {
  const parts = s(slug)
    .replace(/[_]/g, "-")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return parts.join(" ") || slug;
}

async function computeOutFingerprint(outRoot: string) {
  const entries = await fs.readdir(outRoot, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  let count = 0;
  let latest = 0;
  for (const slug of dirs) {
    if (slug === "checkpoints") continue;
    const p = path.join(outRoot, slug, `${slug}.json`);
    if (!(await fileExists(p))) continue;
    count += 1;
    try {
      const st = await fs.stat(p);
      if (st.mtimeMs > latest) latest = st.mtimeMs;
    } catch {}
  }
  return `count=${count};latest=${Math.floor(latest)}`;
}

async function buildOutIndex(outRoot: string): Promise<GscCatalogIndex> {
  const entries = await fs.readdir(outRoot, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const byHostname: Record<string, { state: string }> = {};
  const statesPresent = new Set<string>();

  for (const slug of dirs) {
    if (slug === "checkpoints") continue;
    const p = path.join(outRoot, slug, `${slug}.json`);
    if (!(await fileExists(p))) continue;
    const stateName = titleCaseStateFromSlug(slug);
    statesPresent.add(stateName);
    let json: unknown = null;
    try {
      const raw = await fs.readFile(p, "utf8");
      json = JSON.parse(raw);
    } catch {
      continue;
    }
    const hosts = new Set<string>();
    collectHostnamesDeep(json, hosts);
    for (const host of hosts) {
      const h = s(host).toLowerCase();
      if (!h) continue;
      byHostname[h] = { state: stateName };
    }
  }

  const fingerprint = await computeOutFingerprint(outRoot);
  return { baseDir: outRoot, fingerprint, byHostname, statesPresent };
}

async function computeTenantDbFingerprint(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{ n: string; latest_epoch: string }>(
    `
      select
        count(*)::text as n,
        coalesce(extract(epoch from max(updated_at))::bigint::text, '0') as latest_epoch
      from app.organization_state_files
      where organization_id = $1
    `,
    [tenantId],
  );
  const n = s(q.rows[0]?.n || "0");
  const latest = s(q.rows[0]?.latest_epoch || "0");
  return `count=${n};latest=${latest}`;
}

async function buildTenantDbIndex(tenantId: string): Promise<GscCatalogIndex | null> {
  const pool = getDbPool();
  const q = await pool.query<TenantDbRow>(
    `
      select
        state_slug,
        state_name,
        payload
      from app.organization_state_files
      where organization_id = $1
      order by state_slug asc
    `,
    [tenantId],
  );
  if (!q.rows.length) return null;

  const byHostname: Record<string, { state: string }> = {};
  const statesPresent = new Set<string>();
  for (const row of q.rows) {
    const stateName = s(row.state_name) || titleCaseStateFromSlug(s(row.state_slug));
    statesPresent.add(stateName);
    const hosts = new Set<string>();
    collectHostnamesDeep(row.payload, hosts);
    for (const host of hosts) {
      const h = s(host).toLowerCase();
      if (!h) continue;
      byHostname[h] = { state: stateName };
    }
  }

  const fingerprint = await computeTenantDbFingerprint(tenantId);
  return {
    baseDir: `db:tenant:${tenantId}`,
    fingerprint,
    byHostname,
    statesPresent,
  };
}

export async function loadGscCatalogIndex(opts?: LoadOpts): Promise<GscCatalogIndex> {
  const force = !!opts?.force;
  const tenantId = s(opts?.tenantId);

  const g = globalThis as unknown as {
    __gscCatalogIndexCache?: Record<string, GscCatalogIndex>;
  };
  const cacheStore = g.__gscCatalogIndexCache || {};
  g.__gscCatalogIndexCache = cacheStore;

  if (tenantId) {
    const cacheKey = `tenant:${tenantId}`;
    try {
      const fingerprint = await computeTenantDbFingerprint(tenantId);
      const cached = cacheStore[cacheKey];
      if (!force && cached && cached.baseDir === `db:tenant:${tenantId}` && cached.fingerprint === fingerprint) {
        return cached;
      }
      const built = await buildTenantDbIndex(tenantId);
      if (built) {
        built.fingerprint = fingerprint;
        cacheStore[cacheKey] = built;
        return built;
      }
    } catch {
      // Fall back to scripts/out index if DB is unavailable.
    }
  }

  const repoRoot = findRepoRoot(process.cwd());
  const outRoot = path.join(repoRoot, "scripts", "out");
  const cacheKey = "global_out";
  const fingerprint = await computeOutFingerprint(outRoot);
  const cached = cacheStore[cacheKey];
  if (!force && cached && cached.baseDir === outRoot && cached.fingerprint === fingerprint) {
    return cached;
  }
  const built = await buildOutIndex(outRoot);
  built.fingerprint = fingerprint;
  cacheStore[cacheKey] = built;
  return built;
}

