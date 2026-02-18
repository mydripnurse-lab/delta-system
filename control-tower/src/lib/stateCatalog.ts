import fs from "fs/promises";
import path from "path";
import { getDbPool } from "@/lib/db";

type StateFile = {
  stateName?: string;
  stateSlug?: string;
  counties?: Array<{
    countyDomain?: string;
    cities?: Array<{ cityDomain?: string }>;
  }>;
};

type StateCatalogDbRow = {
  state_slug: string;
  state_name: string;
  payload: Record<string, unknown>;
};

type LoadStateCatalogOpts = {
  tenantId?: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function safeHost(urlStr: string) {
  try {
    const u = new URL(urlStr);
    return (u.hostname || "").toLowerCase();
  } catch {
    return "";
  }
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

export type StateCatalog = {
  states: Array<{ slug: string; name: string }>;
  hostToState: Record<string, { slug: string; name: string }>;
};

async function loadStateCatalogFromDb(tenantId: string): Promise<StateCatalog | null> {
  const id = s(tenantId);
  if (!id) return null;
  const pool = getDbPool();
  const q = await pool.query<StateCatalogDbRow>(
    `
      select state_slug, state_name, payload
      from app.organization_state_files
      where organization_id = $1
      order by state_slug asc
    `,
    [id],
  );
  if (!q.rows.length) return null;

  const states: Array<{ slug: string; name: string }> = [];
  const hostToState: Record<string, { slug: string; name: string }> = {};

  for (const row of q.rows) {
    const slug = s(row.state_slug);
    const name = s(row.state_name) || slug;
    if (!slug) continue;
    states.push({ slug, name });

    const hosts = new Set<string>();
    collectHostnamesDeep(row.payload, hosts);
    for (const h of hosts) {
      const host = s(h).toLowerCase();
      if (!host) continue;
      hostToState[host] = { slug, name };
    }
  }

  return { states, hostToState };
}

async function loadStateCatalogFromOut(): Promise<StateCatalog> {
  const scriptsOut = path.join(process.cwd(), "..", "scripts", "out");
  const states: Array<{ slug: string; name: string }> = [];
  const hostToState: Record<string, { slug: string; name: string }> = {};

  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(scriptsOut);
  } catch {
    return { states, hostToState };
  }

  for (const dir of dirs) {
    const slug = String(dir || "").trim();
    if (!slug) continue;

    const jsonPath = path.join(scriptsOut, slug, `${slug}.json`);
    let raw = "";
    try {
      raw = await fs.readFile(jsonPath, "utf8");
    } catch {
      continue;
    }

    let state: StateFile | null = null;
    try {
      state = JSON.parse(raw);
    } catch {
      continue;
    }

    const name = String(state?.stateName || slug);
    states.push({ slug, name });

    const counties = state?.counties || [];
    for (const c of counties) {
      const ch = safeHost(String(c?.countyDomain || ""));
      if (ch) hostToState[ch] = { slug, name };
      for (const city of c?.cities || []) {
        const h = safeHost(String(city?.cityDomain || ""));
        if (h) hostToState[h] = { slug, name };
      }
    }
  }

  return { states, hostToState };
}

export async function loadStateCatalog(opts?: LoadStateCatalogOpts): Promise<StateCatalog> {
  const tenantId = s(opts?.tenantId);
  if (tenantId) {
    try {
      const fromDb = await loadStateCatalogFromDb(tenantId);
      if (fromDb) return fromDb;
    } catch {
      // fallback to scripts/out
    }
  }
  return loadStateCatalogFromOut();
}

