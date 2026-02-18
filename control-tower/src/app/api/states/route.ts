import { NextResponse } from "next/server";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getDbPool } from "@/lib/db";

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

const REPO_ROOT = findRepoRoot(process.cwd());
const OUT_ROOT = path.join(REPO_ROOT, "scripts", "out");

// ✅ NEW: resources/statesFiles/*.json
const RESOURCES_STATES_ROOT = path.join(REPO_ROOT, "resources", "statesFiles");

function s(v: any) {
    return String(v ?? "").trim();
}

async function listStatesFromOut(): Promise<string[]> {
    const entries = await fs.readdir(OUT_ROOT, { withFileTypes: true }).catch(() => []);
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const states: string[] = [];
    for (const slug of dirs) {
        if (slug === "checkpoints") continue;
        const p = path.join(OUT_ROOT, slug, `${slug}.json`);
        try {
            await fs.access(p);
            states.push(slug);
        } catch { }
    }

    states.sort();
    return states;
}

async function listStatesFromOutByTenant(tenantId: string): Promise<string[]> {
    const tenantOutRoot = path.join(OUT_ROOT, "tenants", tenantId);
    const entries = await fs.readdir(tenantOutRoot, { withFileTypes: true }).catch(() => []);
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const states: string[] = [];
    for (const slug of dirs) {
        if (slug === "checkpoints") continue;
        const p = path.join(tenantOutRoot, slug, `${slug}.json`);
        try {
            await fs.access(p);
            states.push(slug);
        } catch { }
    }

    states.sort();
    return states;
}

async function listStatesFromResources(): Promise<string[]> {
    const entries = await fs.readdir(RESOURCES_STATES_ROOT, { withFileTypes: true }).catch(() => []);
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);

    const states = files
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .map((f) => f.replace(/\.json$/i, ""))
        .filter(Boolean)
        .sort();

    return states;
}

async function listStatesFromTenantResources(tenantId: string): Promise<string[]> {
    const root = path.join(REPO_ROOT, "resources", "tenants", tenantId, "statesFiles");
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    return files
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .map((f) => f.replace(/\.json$/i, ""))
        .filter(Boolean)
        .sort();
}

async function listStatesFromTenantDb(tenantId: string): Promise<string[]> {
    const pool = getDbPool();
    const exists = await pool.query(`select 1 from app.organizations where id = $1 limit 1`, [tenantId]);
    if (!exists.rows[0]) {
        throw new Error("Tenant not found");
    }
    const q = await pool.query<{ state_slug: string }>(
        `
          select state_slug
          from app.organization_state_files
          where organization_id = $1
          order by state_slug asc
        `,
        [tenantId],
    );
    return q.rows.map((r) => s(r.state_slug)).filter(Boolean);
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const source = s(url.searchParams.get("source")).toLowerCase(); // "resources" | "out" | "tenant_files" | ""
        const tenantId = s(url.searchParams.get("tenantId"));

        // ✅ Only when explicitly requested: resources
        let states: string[] = [];
        let resolvedSource: "resources" | "out" | "tenant_db" | "tenant_files" | "tenant_out" = "out";
        if (source === "resources") {
            states = await listStatesFromResources();
            resolvedSource = "resources";
        } else if (source === "tenant_files") {
            if (!tenantId) {
                return NextResponse.json(
                    { states: [], error: "Missing tenantId for tenant_files source" },
                    { status: 400 },
                );
            }
            states = await listStatesFromTenantResources(tenantId);
            resolvedSource = "tenant_files";
        } else if (source === "out" && tenantId) {
            states = await listStatesFromOutByTenant(tenantId);
            resolvedSource = "tenant_out";
            if (!states.length) {
                states = await listStatesFromOut();
                resolvedSource = "out";
            }
        } else if (source === "tenant" || source === "tenant_db") {
            if (!tenantId) {
                return NextResponse.json(
                    { states: [], error: "Missing tenantId for tenant source" },
                    { status: 400 },
                );
            }
            states = await listStatesFromTenantDb(tenantId);
            resolvedSource = "tenant_db";
        } else {
            states = await listStatesFromOut();
            resolvedSource = "out";
        }

        return NextResponse.json({
            states,
            source: resolvedSource,
            tenantId: resolvedSource === "tenant_db" ? tenantId : undefined,
        });
    } catch (e: any) {
        return NextResponse.json(
            { states: [], error: e?.message || "Failed to list states" },
            { status: 500 },
        );
    }
}
