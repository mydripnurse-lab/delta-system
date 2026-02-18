// src/app/api/run/route.ts
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import { spawn } from "child_process";
import readline from "readline";
import { getDbPool } from "@/lib/db";
import { getTenantIntegration, upsertTenantIntegration } from "@/lib/tenantIntegrations";
import { getAgencyAccessTokenOrThrow } from "@/lib/ghlHttp";
import { getTenantSheetConfig } from "@/lib/tenantSheets";

import {
    createRun,
    appendLine,
    attachProcess,
    endRun,
    errorRun,
    setRunMetaCmd,
} from "@/lib/runStore";

export const runtime = "nodejs";

function exists(p: string) {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

function findRepoRoot(startDir: string) {
    // Prefer the nearest ancestor that actually contains scripts/src/builds.
    // This avoids picking /control-tower as repoRoot on machines where that
    // folder also has package/resources but not build scripts.
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
        const hasBuilds = exists(path.join(dir, "scripts", "src", "builds"));
        if (hasBuilds) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    // Fallback heuristic (legacy)
    dir = startDir;
    for (let i = 0; i < 10; i++) {
        const hasResources = exists(path.join(dir, "resources"));
        const hasBuilds = exists(path.join(dir, "scripts", "src", "builds"));
        const hasPkg = exists(path.join(dir, "package.json"));
        const score = (hasResources ? 1 : 0) + (hasBuilds ? 1 : 0) + (hasPkg ? 1 : 0);
        if (score >= 2) return dir;

        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return startDir;
}

function resolveScriptPath(repoRoot: string, jobKey: string) {
    const buildsDir = path.join(repoRoot, "scripts", "src", "builds");

    const candidatesByJob: Record<string, string[]> = {
        "run-delta-system": [path.join(repoRoot, "scripts", "run-delta-system.js")],
        "update-custom-values": [path.join(repoRoot, "scripts", "update-custom-values-from-sheet.js")],
        "update-custom-values-one": [path.join(repoRoot, "scripts", "update-custom-values-one.js")],
        "build-sheet-rows": [
            path.join(buildsDir, "build-sheets-counties-cities.js"),
            path.join(buildsDir, "build-sheet-rows.js"),
        ],
        "build-state-index": [
            path.join(buildsDir, "build-states-index.js"),
            path.join(buildsDir, "build-state-index.js"),
        ],
        "build-state-sitemaps": [
            path.join(buildsDir, "build-states-sitemaps.js"),
            path.join(buildsDir, "build-state-sitemaps.js"),
        ],
        "build-counties": [path.join(buildsDir, "build-counties.js")],
    };

    const candidates = candidatesByJob[jobKey] || [];
    for (const c of candidates) if (exists(c)) return c;

    const direct = path.join(buildsDir, `${jobKey}.js`);
    if (exists(direct)) return direct;

    return null;
}

function normalizeMode(raw: unknown) {
    const m = String(raw || "").trim().toLowerCase();
    return m === "live" ? "live" : "dry";
}

function safeStateArg(state: unknown) {
    const s = String(state || "").trim();
    return s ? s : "all";
}

// --- tiny env loader (no dependency)
function parseEnvFile(contents: string) {
    const out: Record<string, string> = {};
    const lines = contents.split(/\r?\n/);
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq <= 0) continue;
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        out[k] = v;
    }
    return out;
}

function loadRepoEnv(repoRoot: string) {
    const envPaths = [path.join(repoRoot, ".env"), path.join(repoRoot, ".env.local")];
    const merged: Record<string, string> = {};
    for (const p of envPaths) {
        if (!exists(p)) continue;
        try {
            const raw = fs.readFileSync(p, "utf8");
            Object.assign(merged, parseEnvFile(raw));
        } catch {
            // ignore
        }
    }
    return merged;
}

function s(v: unknown) {
    return String(v ?? "").trim();
}

function asObj(v: unknown) {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function pickOauthClient(cfg: Record<string, unknown>) {
    const oauthClient = asObj(cfg.oauthClient);
    const oauth = asObj(cfg.oauth);
    return {
        clientId: s(oauthClient.clientId ?? oauthClient.client_id ?? oauth.clientId ?? oauth.client_id ?? cfg.clientId ?? cfg.client_id),
        clientSecret: s(
            oauthClient.clientSecret ??
                oauthClient.client_secret ??
                oauth.clientSecret ??
                oauth.client_secret ??
                cfg.clientSecret ??
                cfg.client_secret,
        ),
    };
}

function parseTokenUpdateLine(line: string) {
    const prefix = "__GHL_TOKEN_UPDATE__ ";
    if (!line.startsWith(prefix)) return null;
    try {
        return JSON.parse(line.slice(prefix.length)) as {
            access_token?: string;
            refresh_token?: string;
            expires_at?: number;
            scope?: string;
            companyId?: string;
            locationId?: string;
        };
    } catch {
        return null;
    }
}

function jobNeedsSheet(job: string) {
    return (
        job === "run-delta-system" ||
        job === "update-custom-values" ||
        job === "update-custom-values-one" ||
        job === "build-sheet-rows"
    );
}

function jobNeedsGhl(job: string) {
    return job === "run-delta-system" || job === "update-custom-values" || job === "update-custom-values-one";
}

function isOneLocJob(job: string) {
    return job === "update-custom-values-one";
}

function jobUsesState(job: string) {
    // jobs que realmente consumen state (args/env) para iterar / seleccionar archivos
    return (
        job === "run-delta-system" ||
        job === "update-custom-values" ||
        job === "build-state-index" ||
        job === "build-state-sitemaps" ||
        job === "build-counties" ||
        job === "build-sheet-rows"
    );
}

async function materializeTenantStateFilesFromDb(tenantId: string) {
    const pool = getDbPool();
    const q = await pool.query<{ state_slug: string; payload: Record<string, unknown> }>(
        `
          select state_slug, payload
          from app.organization_state_files
          where organization_id = $1
          order by state_slug asc
        `,
        [tenantId],
    );
    if (!q.rows.length) {
        throw new Error(`No state files found in DB for tenant ${tenantId}. Seed tenant state files first.`);
    }
    const dir = path.join(os.tmpdir(), `ct-state-files-${tenantId}-${Date.now()}`);
    await fsp.mkdir(dir, { recursive: true });
    for (const row of q.rows) {
        const slug = String(row.state_slug || "").trim().toLowerCase();
        if (!slug) continue;
        const filePath = path.join(dir, `${slug}.json`);
        await fsp.writeFile(filePath, JSON.stringify(row.payload || {}, null, 2), "utf8");
    }
    return { dir, count: q.rows.length };
}

type TenantRunEnvResult = {
    env: Record<string, string>;
    ghlProvider: "ghl" | "custom" | "";
    ghlIntegrationKey: string;
};

async function loadTenantRunEnv(tenantId: string, opts: { requireSheet: boolean; requireGhl: boolean }): Promise<TenantRunEnvResult> {
    const pool = getDbPool();
    const settingsQ = await pool.query<{
        ghl_company_id: string | null;
        snapshot_id: string | null;
        owner_first_name: string | null;
        owner_last_name: string | null;
        owner_email: string | null;
        owner_phone: string | null;
        google_service_account_json: Record<string, unknown> | null;
    }>(
        `
          select ghl_company_id, snapshot_id, owner_first_name, owner_last_name, owner_email, owner_phone, google_service_account_json
          from app.organization_settings
          where organization_id = $1
          limit 1
        `,
        [tenantId],
    );
    const settings = settingsQ.rows[0] || {
        ghl_company_id: null,
        snapshot_id: null,
        owner_first_name: null,
        owner_last_name: null,
        owner_email: null,
        owner_phone: null,
        google_service_account_json: null,
    };

    const ownerGhl = await getTenantIntegration(tenantId, "ghl", "owner");
    const ownerCustom = ownerGhl ? null : await getTenantIntegration(tenantId, "custom", "owner");
    const owner = ownerGhl || ownerCustom;
    const ghlProvider: "ghl" | "custom" | "" = ownerGhl ? "ghl" : ownerCustom ? "custom" : "";
    const cfg = asObj(owner?.config);
    const ownerMeta = asObj(owner?.metadata);
    const twilio = asObj(cfg.twilio);
    const mailgun = asObj(cfg.mailgun);
    const oauthScopes = Array.isArray(cfg.oauthScopes) ? cfg.oauthScopes.map((x) => s(x)).filter(Boolean) : [];
    const oauthUserType = s(cfg.oauthUserType) || "Location";

    const env: Record<string, string> = {
        COMPANY_ID: s(cfg.companyId) || s(settings.ghl_company_id),
        GHL_COMPANY_ID: s(cfg.companyId) || s(settings.ghl_company_id),
        SNAPSHOT_ID: s(settings.snapshot_id),
        OWNER_FIRST_NAME: s(settings.owner_first_name),
        OWNER_LAST_NAME: s(settings.owner_last_name),
        OWNER_EMAIL: s(settings.owner_email),
        OWNER_PHONE: s(settings.owner_phone),
        DEFAULT_PHONE: s(settings.owner_phone) || "1 (833) 381-0071",
        TWILIO_SID: s(twilio.sid),
        TWILIO_AUTH_TOKEN: s(twilio.authToken),
        MAILGUN_API_KEY: s(mailgun.apiKey),
        MAILGUN_DOMAIN: s(mailgun.domain),
        BUSINESS_EMAIL: s(settings.owner_email),
        GHL_LOCATION_ID: s(owner?.externalAccountId) || s(cfg.locationId),
        GHL_SCOPES: oauthScopes.join(" "),
        GHL_USER_TYPE: oauthUserType,
        FACEBOOK_PIXEL: s(asObj(cfg.marketing).facebookPixel),
        FACEBOOK_ACCESS_TOKEN: s(asObj(cfg.marketing).facebookAccessToken),
    };
    if (settings.google_service_account_json) {
        env.GOOGLE_SERVICE_ACCOUNT_JSON_B64 = Buffer.from(
            JSON.stringify(settings.google_service_account_json),
            "utf8",
        ).toString("base64");
    }

    if (opts.requireSheet) {
        try {
            const sheet = await getTenantSheetConfig(tenantId);
            env.GOOGLE_SHEET_ID = s(sheet.spreadsheetId);
            env.GOOGLE_SHEET_COUNTY_TAB = s(sheet.countyTab);
            env.GOOGLE_SHEET_CITY_TAB = s(sheet.cityTab);
            env.GOOGLE_SHEET_HEADERS_TAB = s(sheet.headersTab);
            env.GOOGLE_SHEET_HEADERS_RANGE = s(sheet.headersRange);
            env.GOOGLE_SHEET_CALL_REPORT_TAB = s(sheet.callReportTab);
        } catch (error: unknown) {
            if (opts.requireSheet) {
                throw new Error(
                    `Tenant ${tenantId} missing sheet config in DB: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
    }

    if (opts.requireGhl) {
        if (!owner || !ghlProvider) {
            throw new Error(`Tenant ${tenantId} missing owner integration (provider ghl/custom, key owner).`);
        }
        const oauthClient = pickOauthClient(cfg);
        if (!oauthClient.clientId || !oauthClient.clientSecret) {
            throw new Error(
                `Tenant ${tenantId} owner integration missing OAuth client credentials (config.oauthClient.clientId/clientSecret).`,
            );
        }

        const accessToken = await getAgencyAccessTokenOrThrow({ tenantId, integrationKey: "owner" });
        const refreshed = await getTenantIntegration(tenantId, ghlProvider, "owner");
        const refreshToken = s(refreshed?.refreshTokenEnc || owner.refreshTokenEnc);
        const expiresAtMs = refreshed?.tokenExpiresAt ? new Date(refreshed.tokenExpiresAt).getTime() : 0;

        env.GHL_CLIENT_ID = oauthClient.clientId;
        env.GHL_CLIENT_SECRET = oauthClient.clientSecret;
        env.GHL_ACCESS_TOKEN = accessToken;
        env.GHL_REFRESH_TOKEN = refreshToken;
        env.GHL_EXPIRES_AT = expiresAtMs > 0 ? String(expiresAtMs) : "";
        env.GHL_COMPANY_ID = env.GHL_COMPANY_ID || s(ownerMeta.companyId);
        env.COMPANY_ID = env.COMPANY_ID || env.GHL_COMPANY_ID;
    }

    return { env, ghlProvider, ghlIntegrationKey: "owner" };
}

async function persistTenantGhlTokenUpdate(input: {
    tenantId: string;
    provider: "ghl" | "custom";
    integrationKey: string;
    linePayload: {
        access_token?: string;
        refresh_token?: string;
        expires_at?: number;
        scope?: string;
        companyId?: string;
        locationId?: string;
    };
}) {
    const existing = await getTenantIntegration(input.tenantId, input.provider, input.integrationKey);
    if (!existing) return false;

    const accessToken = s(input.linePayload.access_token);
    const refreshToken = s(input.linePayload.refresh_token) || s(existing.refreshTokenEnc);
    if (!accessToken) return false;

    const expMs = Number(input.linePayload.expires_at || 0);
    const tokenExpiresAt = Number.isFinite(expMs) && expMs > 0 ? new Date(expMs).toISOString() : existing.tokenExpiresAt;
    const scopeList = s(input.linePayload.scope).split(" ").map((x) => s(x)).filter(Boolean);
    const metadata = { ...(existing.metadata || {}) };
    if (s(input.linePayload.companyId)) metadata.companyId = s(input.linePayload.companyId);
    if (s(input.linePayload.locationId)) metadata.locationId = s(input.linePayload.locationId);

    await upsertTenantIntegration({
        organizationId: input.tenantId,
        provider: input.provider,
        integrationKey: input.integrationKey,
        status: "connected",
        authType: "oauth",
        accessTokenEnc: accessToken,
        refreshTokenEnc: refreshToken || null,
        tokenExpiresAt: tokenExpiresAt || null,
        scopes: scopeList.length ? scopeList : existing.scopes,
        externalAccountId: s(input.linePayload.locationId) || existing.externalAccountId || null,
        externalPropertyId: existing.externalPropertyId || null,
        config: existing.config || {},
        metadata,
        lastError: null,
    });
    return true;
}

export async function POST(req: Request) {
    const body = await req.json().catch(() => null);

    const job = String(body?.job || "").trim();
    if (!job) return NextResponse.json({ error: "Missing job" }, { status: 400 });

    const mode = normalizeMode(body?.mode);
    const debug = !!body?.debug;
    const tenantId = String(body?.tenantId || "").trim();

    const locId = String(body?.locId || "").trim();
    const kind = String(body?.kind || "").trim(); // "counties" | "cities" | ""

    // state aquí es metadata + (para jobs que lo usan)
    const rawState = safeStateArg(body?.state);

    // ✅ PRO: para job "one", el state es solo metadata. Evita "all".
    const metaState = isOneLocJob(job)
        ? rawState && rawState !== "all"
            ? rawState
            : "one"
        : rawState;

    const repoRoot = findRepoRoot(process.cwd());
    const scriptPath = resolveScriptPath(repoRoot, job);

    if (!scriptPath) {
        return NextResponse.json(
            { error: `Script not found for job="${job}". (repoRoot=${repoRoot})` },
            { status: 400 }
        );
    }

    // ✅ PRO: valida locId para job one
    if (isOneLocJob(job) && !locId) {
        return NextResponse.json({ error: "Missing locId for update-custom-values-one" }, { status: 400 });
    }

    const run = createRun({ job, state: metaState, mode, debug, tenantId });

    let closed = false;

    try {
        appendLine(run.id, `🟢 created runId=${run.id}`);
        appendLine(run.id, `job=${job} state=${metaState} mode=${mode} debug=${debug}`);
        if (locId) appendLine(run.id, `locId=${locId} kind=${kind || "auto"}`);
        if (tenantId) appendLine(run.id, `tenantId=${tenantId}`);

        // ✅ Build args properly per job
        const args: string[] = [scriptPath];

        // mode/debug always
        args.push(`--mode=${mode}`);
        args.push(`--debug=${debug ? "1" : "0"}`);

        // state only for jobs that use it
        if (!isOneLocJob(job) && jobUsesState(job)) {
            args.push(`--state=${rawState}`);
            // positional fallback (solo donde aplica)
            args.push(rawState);
        }

        // locId/kind for one-loc job
        if (locId) args.push(`--locId=${locId}`);
        if (kind) args.push(`--kind=${kind}`);

        const cmd = `node ${args.map((a) => JSON.stringify(a)).join(" ")}`;
        setRunMetaCmd(run.id, cmd);

        const repoEnv = loadRepoEnv(repoRoot);
        let tenantRunEnv: TenantRunEnvResult | null = null;
        if (tenantId) {
            tenantRunEnv = await loadTenantRunEnv(tenantId, {
                requireSheet: jobNeedsSheet(job),
                requireGhl: jobNeedsGhl(job),
            });
            appendLine(run.id, "tenant-config source=db (owner/settings/integrations)");
        }

        const envMerged: NodeJS.ProcessEnv = {
            ...process.env,
            ...repoEnv,
            ...(tenantRunEnv?.env || {}),
            MODE: mode,
            DEBUG: debug ? "1" : "0",
            LOC_ID: locId || "",
            KIND: kind || "",
            TENANT_ID: tenantId || "",
        };

        let tempStateFilesDir = "";
        if (tenantId && jobUsesState(job)) {
            const seeded = await materializeTenantStateFilesFromDb(tenantId);
            tempStateFilesDir = seeded.dir;
            envMerged.STATE_FILES_DIR = tempStateFilesDir;
            appendLine(run.id, `state-files source=db materialized=${seeded.count} dir=${tempStateFilesDir}`);
        }

        // ✅ state env solo cuando aplica
        if (!isOneLocJob(job) && jobUsesState(job)) {
            envMerged.DELTA_STATE = rawState;
            envMerged.STATE = rawState;
        }

        const child = spawn(process.execPath, args, {
            cwd: repoRoot,
            env: envMerged,
            stdio: ["pipe", "pipe", "pipe"],
        });

        attachProcess(run.id, child);

        const rlOut = readline.createInterface({ input: child.stdout });
        const rlErr = readline.createInterface({ input: child.stderr });

        rlOut.on("line", (line) => {
            const tokenUpdate = parseTokenUpdateLine(line);
            if (tokenUpdate && tenantId && tenantRunEnv?.ghlProvider) {
                appendLine(run.id, "token-refresh detected (ghl) -> persisting to DB...");
                void persistTenantGhlTokenUpdate({
                    tenantId,
                    provider: tenantRunEnv.ghlProvider,
                    integrationKey: tenantRunEnv.ghlIntegrationKey,
                    linePayload: tokenUpdate,
                })
                    .then((ok) => appendLine(run.id, ok ? "token-refresh persisted in DB." : "token-refresh skipped (empty/invalid)."))
                    .catch((e: unknown) =>
                        appendLine(
                            run.id,
                            `token-refresh persist error: ${e instanceof Error ? e.message : String(e)}`,
                        ),
                    );
                return;
            }
            appendLine(run.id, line);
        });
        rlErr.on("line", (line) => appendLine(run.id, line));

        child.on("error", (err) => {
            errorRun(run.id, err);
            if (!closed) {
                closed = true;
                try {
                    rlOut.close();
                    rlErr.close();
                } catch { }
                if (tempStateFilesDir) {
                    void fsp.rm(tempStateFilesDir, { recursive: true, force: true }).catch(() => {});
                }
                endRun(run.id, 1);
            }
        });

        child.on("close", (code) => {
            if (closed) return;
            closed = true;

            try {
                rlOut.close();
                rlErr.close();
            } catch { }
            if (tempStateFilesDir) {
                void fsp.rm(tempStateFilesDir, { recursive: true, force: true }).catch(() => {});
            }

            endRun(run.id, code ?? 0);
        });

        return NextResponse.json({ runId: run.id });
    } catch (err) {
        errorRun(run.id, err);
        if (!closed) {
            closed = true;
            endRun(run.id, 1);
        }
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err), runId: run.id },
            { status: 500 }
        );
    }
}
