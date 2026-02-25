// scripts/run-delta-system.js
try {
    await import("dotenv/config");
} catch {}

import fs from "fs/promises";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

import { loadTokens } from "../services/tokenStore.js";
import { ghlFetch } from "../services/ghlClient.js";

import {
    findTwilioAccountByFriendlyName,
    listSubaccounts,
    closeTwilioAccount,
} from "../services/twilioClient.js";

import {
    loadSheetTabIndex,
    updateRowByHeaders,
    makeCompositeKey,
} from "../services/sheetsClient.js";

// =====================
// PATHS / CONFIG
// =====================
const TENANT_ID = String(process.env.TENANT_ID || "").trim();
const OUT_ROOT =
    String(process.env.OUT_ROOT_DIR || "").trim() ||
    (TENANT_ID
        ? path.join(process.cwd(), "scripts", "out", "tenants", TENANT_ID)
        : path.join(process.cwd(), "scripts", "out"));
const CHECKPOINT_DIR =
    String(process.env.DELTA_CHECKPOINT_DIR || "").trim() ||
    path.join(
        path.dirname(OUT_ROOT),
        "_checkpoints",
        "run-delta-system",
        TENANT_ID || "global"
    );
const CHECKPOINT_ENABLED = String(process.env.DELTA_CHECKPOINT_ENABLED || "1") !== "0";
const CHECKPOINT_AUTO_RESUME = String(process.env.DELTA_CHECKPOINT_AUTO_RESUME || "1") !== "0";
const CHECKPOINT_FLUSH_EVERY = Math.max(
    1,
    Number(process.env.DELTA_CHECKPOINT_FLUSH_EVERY || "1")
);
const RESET_CHECKPOINTS = String(process.env.DELTA_CHECKPOINT_RESET || "0") === "1";

// Sheets
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const COUNTY_TAB = process.env.GOOGLE_SHEET_COUNTY_TAB || "Counties";
const CITY_TAB = process.env.GOOGLE_SHEET_CITY_TAB || "Cities";
const FAST_MODE_CLI =
    process.argv.includes("--fast") ||
    String(process.env.DELTA_FAST_MODE || "") === "1";

// Rate limiting (GHL)
const GHL_RPM = Number(process.env.GHL_RPM || (FAST_MODE_CLI ? "300" : "180"));
const MIN_MS_BETWEEN_GHL_CALLS = Math.ceil(60000 / Math.max(1, GHL_RPM));

// Run meta
const RUN_ID = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const RUN_STARTED_AT = Date.now();

// =====================
// CLI FLAGS (UI-friendly)
// =====================
const isDryRun = process.argv.includes("--dry-run");

// ✅ allow: --debug OR --debug=1
const DEBUG =
    process.argv.includes("--debug") ||
    String(process.env.DEBUG || "") === "1" ||
    process.argv.some((a) => String(a).startsWith("--debug=") && String(a).split("=")[1] === "1");

// ✅ NEW: --state=all | --state=alabama | --state="Alabama,Florida"
function argValue(name, fallback = null) {
    const argv = process.argv.slice(2);
    const direct = `--${name}=`;

    for (let i = 0; i < argv.length; i++) {
        const a = String(argv[i] ?? "");
        if (a === `--${name}`) {
            const next = argv[i + 1];
            if (next && !String(next).startsWith("--")) return String(next);
            return fallback;
        }
        if (a.startsWith(direct)) return a.slice(direct.length);
    }
    return fallback;
}

const STATE_ARG = argValue("state", ""); // if empty -> interactive
const FAST_MODE = FAST_MODE_CLI;

const ENABLE_TWILIO_CLOSE = String(process.env.DELTA_ENABLE_TWILIO_CLOSE || "1") !== "0";
const SHEETS_LOAD_TIMEOUT_MS = Math.max(
    5000,
    Number(process.env.DELTA_SHEETS_LOAD_TIMEOUT_MS || "90000")
);
const SHEETS_LOAD_MAX_RETRIES = Math.max(
    1,
    Number(process.env.DELTA_SHEETS_LOAD_MAX_RETRIES || "4")
);
const SHEETS_LOAD_RETRY_DELAY_MS = Math.max(
    500,
    Number(process.env.DELTA_SHEETS_LOAD_RETRY_DELAY_MS || "2500")
);
const ACCOUNT_PROCESS_TIMEOUT_MS = Math.max(
    10000,
    Number(process.env.DELTA_ACCOUNT_PROCESS_TIMEOUT_MS || "300000")
);
const ACCOUNT_MAX_RETRIES = Math.max(
    1,
    Number(process.env.DELTA_ACCOUNT_MAX_RETRIES || "2")
);
const TWILIO_LOOKUP_TIMEOUT_MS = Math.max(
    1000,
    Number(process.env.DELTA_TWILIO_LOOKUP_TIMEOUT_MS || (FAST_MODE ? "8000" : "12000"))
);
const TWILIO_CLOSE_TIMEOUT_MS = Math.max(
    1000,
    Number(process.env.DELTA_TWILIO_CLOSE_TIMEOUT_MS || (FAST_MODE ? "8000" : "12000"))
);
const TWILIO_CLOSE_MAX_RETRIES = Math.max(
    0,
    Number(process.env.DELTA_TWILIO_CLOSE_MAX_RETRIES || "1")
);
const TWILIO_CLOSE_RETRY_DELAY_MS = Math.max(
    250,
    Number(process.env.DELTA_TWILIO_CLOSE_RETRY_DELAY_MS || "900")
);
const TWILIO_STEP_TIMEOUT_MS = Math.max(
    1000,
    Number(process.env.DELTA_TWILIO_STEP_TIMEOUT_MS || (FAST_MODE ? "12000" : "18000"))
);
const MAX_SUBACCOUNT_RECOVERY_RETRIES = Math.max(
    0,
    Number(process.env.DELTA_MAX_SUBACCOUNT_RECOVERY_RETRIES || "1")
);

// =====================
// PROGRESS (SSE-friendly)
// =====================
function emitProgressInit({ totals, message }) {
    const payload = {
        totals: {
            all: Number(totals?.all ?? 0),
            counties: Number(totals?.counties ?? 0),
            cities: Number(totals?.cities ?? 0),
        },
        done: { all: 0, counties: 0, cities: 0 },
        pct: 0,
        last: { kind: "state", state: "", action: "init" },
        message: message || "init",
    };
    console.log(`__PROGRESS_INIT__ ${JSON.stringify(payload)}`);
}

function emitProgress({ totals, done, last, message }) {
    const totalAll = Number(totals?.all ?? 0);
    const doneAll = Number(done?.all ?? 0);
    const pct = totalAll > 0 ? Math.max(0, Math.min(1, doneAll / totalAll)) : 0;

    const payload = {
        totals: {
            all: totalAll,
            counties: Number(totals?.counties ?? 0),
            cities: Number(totals?.cities ?? 0),
        },
        done: {
            all: doneAll,
            counties: Number(done?.counties ?? 0),
            cities: Number(done?.cities ?? 0),
        },
        pct,
        last: last || null,
        message: message || "",
    };

    console.log(`__PROGRESS__ ${JSON.stringify(payload)}`);
}

function emitProgressEnd({ totals, done, ok, error }) {
    const totalAll = Number(totals?.all ?? 0);
    const doneAll = Number(done?.all ?? 0);
    const pct = totalAll > 0 ? Math.max(0, Math.min(1, doneAll / totalAll)) : 1;

    const payload = {
        totals: {
            all: totalAll,
            counties: Number(totals?.counties ?? 0),
            cities: Number(totals?.cities ?? 0),
        },
        done: {
            all: doneAll,
            counties: Number(done?.counties ?? 0),
            cities: Number(done?.cities ?? 0),
        },
        pct,
        ok: !!ok,
        error: error || null,
        last: { kind: "state", state: "", action: "end" },
    };

    console.log(`__PROGRESS_END__ ${JSON.stringify(payload)}`);
}

// =====================
// HELPERS
// =====================
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout(promise, timeoutMs, timeoutMessage) {
    let timeout = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeout = setTimeout(() => {
                    const err = new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`);
                    err.code = "ETIMEDOUT";
                    reject(err);
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function formatTwilioErr(e) {
    const msg = String(e?.message || e || "unknown error");
    const st = Number(e?.status ?? e?.code);
    const status = Number.isFinite(st) ? st : null;
    const detail =
        e?.data && typeof e.data === "object"
            ? String(e.data?.message || e.data?.error?.message || JSON.stringify(e.data)).slice(0, 500)
            : "";
    if (status && detail) return `${msg} | status=${status} | detail=${detail}`;
    if (status) return `${msg} | status=${status}`;
    return msg;
}

async function closeTwilioAccountWithRetry(sid, reasonLabel = "twilio-close") {
    const targetSid = String(sid || "").trim();
    if (!targetSid) throw new Error("Missing Twilio SID to close");
    let lastErr = null;
    const maxAttempts = 1 + TWILIO_CLOSE_MAX_RETRIES;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await withTimeout(
                closeTwilioAccount(targetSid),
                TWILIO_CLOSE_TIMEOUT_MS,
                `Twilio close timeout (${TWILIO_CLOSE_TIMEOUT_MS}ms) sid=${targetSid}`
            );
        } catch (e) {
            lastErr = e;
            const formatted = formatTwilioErr(e);
            console.log(
                `⚠️ Twilio close attempt ${attempt}/${maxAttempts} failed (${reasonLabel}) sid=${targetSid}: ${formatted}`
            );
            if (attempt < maxAttempts) {
                await sleep(TWILIO_CLOSE_RETRY_DELAY_MS * attempt);
            }
        }
    }
    throw lastErr || new Error(`Twilio close failed sid=${targetSid}`);
}

async function loadSheetTabIndexWithRecovery(params) {
    let lastErr = null;
    for (let attempt = 1; attempt <= SHEETS_LOAD_MAX_RETRIES; attempt++) {
        try {
            return await withTimeout(
                loadSheetTabIndex(params),
                SHEETS_LOAD_TIMEOUT_MS,
                `Load sheet timeout (${SHEETS_LOAD_TIMEOUT_MS}ms) for tab "${params?.sheetName || ""}"`
            );
        } catch (e) {
            lastErr = e;
            const msg = e?.message || e;
            console.log(
                `⚠️ Sheet load attempt ${attempt}/${SHEETS_LOAD_MAX_RETRIES} failed (${params?.sheetName}): ${msg}`
            );
            if (attempt < SHEETS_LOAD_MAX_RETRIES) {
                await sleep(SHEETS_LOAD_RETRY_DELAY_MS * attempt);
            }
        }
    }
    throw lastErr || new Error(`Failed to load sheet tab "${params?.sheetName || ""}"`);
}

async function processOneAccountWithRecovery(args) {
    const isRetriableStatus = (status) =>
        status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
    const statusFromErr = (e) => {
        const s = Number(e?.status ?? e?.code);
        return Number.isFinite(s) ? s : null;
    };
    const formatError = (e) => {
        const msg = String(e?.message || e || "unknown error");
        const st = statusFromErr(e);
        const data = e?.data;
        const detail =
            data && typeof data === "object"
                ? String(data?.error?.message || data?.message || JSON.stringify(data)).slice(0, 500)
                : "";
        if (st && detail) return `${msg} | status=${st} | detail=${detail}`;
        if (st) return `${msg} | status=${st}`;
        return msg;
    };

    let lastErr = null;
    for (let attempt = 1; attempt <= ACCOUNT_MAX_RETRIES; attempt++) {
        try {
            return await withTimeout(
                processOneAccount(args),
                ACCOUNT_PROCESS_TIMEOUT_MS,
                `Account processing timeout (${ACCOUNT_PROCESS_TIMEOUT_MS}ms)`
            );
        } catch (e) {
            lastErr = e;
            const status = statusFromErr(e);
            const retriable = status === null ? true : isRetriableStatus(status);
            const formatted = formatError(e);
            console.log(
                `⚠️ Account attempt ${attempt}/${ACCOUNT_MAX_RETRIES} failed: ${formatted}`
            );
            if (!retriable) {
                console.log(`⏭️ Account retry skipped (non-retriable status ${status})`);
                throw e;
            }
            if (attempt < ACCOUNT_MAX_RETRIES) {
                await sleep(1000 * attempt);
            }
        }
    }
    throw lastErr || new Error("Account processing failed");
}

let _lastGhlCallAt = 0;
async function ghlThrottle() {
    const now = Date.now();
    const wait = _lastGhlCallAt + MIN_MS_BETWEEN_GHL_CALLS - now;
    if (wait > 0) await sleep(wait);
    _lastGhlCallAt = Date.now();
}

function isPR(stateSlug, stateName) {
    const s = String(stateSlug || "").toLowerCase();
    const n = String(stateName || "").toLowerCase();
    return s === "puerto-rico" || n.includes("puerto rico");
}

function toBoolishTRUE() {
    return "TRUE";
}

let LAST_SUCCESSFUL_LOCATION_NAME = "";

function isTwilioSubaccountLimitError(e) {
    const status = Number(e?.status ?? e?.code ?? 0);
    const msg = String(e?.message || "");
    const detail =
        e?.data && typeof e.data === "object"
            ? String(e.data?.error?.message || e.data?.message || JSON.stringify(e.data))
            : "";
    const haystack = `${msg} ${detail}`.toLowerCase();
    return (
        status === 400 &&
        (haystack.includes("maximum number of subaccounts") ||
            haystack.includes("reached maximum number of subaccounts"))
    );
}

async function tryFreeTwilioCapacityFromPreviousAccount() {
    if (!ENABLE_TWILIO_CLOSE) return false;
    const previousName = String(LAST_SUCCESSFUL_LOCATION_NAME || "").trim();
    console.log(`🧯 Twilio capacity recovery: previousName="${previousName || "n/a"}"`);
    try {
        // 1) Try by previous successful friendly name (same 64-char strategy as normal flow).
        if (previousName) {
            const lookupName = previousName.slice(0, 64);
            const twilioAcc =
                (await withTimeout(
                    findTwilioAccountByFriendlyName(lookupName, {
                        exact: true,
                        limit: FAST_MODE ? 60 : 200,
                    }),
                    TWILIO_LOOKUP_TIMEOUT_MS,
                    `Twilio recovery lookup timeout (${TWILIO_LOOKUP_TIMEOUT_MS}ms) for "${lookupName}"`
                )) ||
                (await withTimeout(
                    findTwilioAccountByFriendlyName(lookupName, {
                        exact: false,
                        limit: FAST_MODE ? 80 : 250,
                    }),
                    TWILIO_LOOKUP_TIMEOUT_MS,
                    `Twilio recovery fuzzy lookup timeout (${TWILIO_LOOKUP_TIMEOUT_MS}ms) for "${lookupName}"`
                ));

                if (twilioAcc?.sid) {
                    if (String(twilioAcc.status || "").toLowerCase() === "closed") {
                        console.log(
                            `ℹ️ Twilio capacity recovery: previous account already closed (sid=${twilioAcc.sid}).`
                        );
                        return true;
                    }
                    const closed = await closeTwilioAccountWithRetry(
                        String(twilioAcc.sid),
                        "capacity-recovery-by-name"
                    );
                console.log(
                    `✅ Twilio capacity recovery: closed by previous name sid=${closed?.sid || twilioAcc.sid} status=${closed?.status || "closed"}`
                );
                return true;
            }
        }

        // 2) Fallback: close one active eligible subaccount.
        const subs = await withTimeout(
            listSubaccounts({ limit: FAST_MODE ? 80 : 300 }),
            TWILIO_LOOKUP_TIMEOUT_MS,
            `Twilio recovery list timeout (${TWILIO_LOOKUP_TIMEOUT_MS}ms)`
        );
        const active = (Array.isArray(subs) ? subs : []).filter(
            (a) => String(a?.status || "").toLowerCase() === "active"
        );
        const eligible =
            active.find((a) =>
                String(a?.friendlyName || "").toLowerCase().includes("my drip nurse")
            ) || active[0];

        if (!eligible?.sid) {
            console.log("⚠️ Twilio capacity recovery: no active subaccount available to close.");
            return false;
        }

        const closed = await closeTwilioAccountWithRetry(
            String(eligible.sid),
            "capacity-recovery-fallback"
        );
        console.log(
            `✅ Twilio capacity recovery: closed fallback active sid=${closed?.sid || eligible.sid} name="${eligible?.friendlyName || ""}" status=${closed?.status || "closed"}`
        );
        return true;
    } catch (e) {
        console.log("⚠️ Twilio capacity recovery failed:", e?.message || e);
        return false;
    }
}

function formatErrWithDetails(e) {
    const msg = String(e?.message || e || "unknown error");
    const st = Number(e?.status ?? e?.code);
    const status = Number.isFinite(st) ? st : null;
    const data = e?.data;
    const detail =
        data && typeof data === "object"
            ? String(data?.error?.message || data?.message || JSON.stringify(data)).slice(0, 500)
            : "";
    if (status && detail) return `${msg} | status=${status} | detail=${detail}`;
    if (status) return `${msg} | status=${status}`;
    return msg;
}

function toCheckpointToken(s) {
    return String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function checkpointFileForState(stateSlug) {
    return path.join(CHECKPOINT_DIR, `${toCheckpointToken(stateSlug) || "unknown-state"}.json`);
}

function makeCheckpointItemKey({ kind, stateSlug, countyName = "", cityName = "" }) {
    const state = toCheckpointToken(stateSlug);
    const county = toCheckpointToken(countyName);
    const city = toCheckpointToken(cityName);
    if (kind === "county") return `county|${state}|${county}`;
    return `city|${state}|${county}|${city}`;
}

async function ensureCheckpointDir() {
    if (!CHECKPOINT_ENABLED) return;
    await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
}

async function resetCheckpointsIfRequested() {
    if (!CHECKPOINT_ENABLED || !RESET_CHECKPOINTS) return;
    await fs.rm(CHECKPOINT_DIR, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(CHECKPOINT_DIR, { recursive: true });
    console.log(`🧹 Checkpoints reset at ${CHECKPOINT_DIR}`);
}

async function loadStateCheckpoint(stateSlug) {
    const fallback = {
        version: 1,
        tenantId: TENANT_ID || "",
        stateSlug: String(stateSlug || ""),
        updatedAt: null,
        runIdLast: "",
        processed: {
            counties: [],
            cities: [],
        },
    };
    if (!CHECKPOINT_ENABLED || !CHECKPOINT_AUTO_RESUME) return fallback;
    const filePath = checkpointFileForState(stateSlug);
    try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        return {
            ...fallback,
            ...parsed,
            processed: {
                counties: Array.isArray(parsed?.processed?.counties)
                    ? parsed.processed.counties.map((x) => String(x))
                    : [],
                cities: Array.isArray(parsed?.processed?.cities)
                    ? parsed.processed.cities.map((x) => String(x))
                    : [],
            },
        };
    } catch {
        return fallback;
    }
}

async function saveStateCheckpoint(stateSlug, checkpointState) {
    if (!CHECKPOINT_ENABLED) return;
    await ensureCheckpointDir();
    const filePath = checkpointFileForState(stateSlug);
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    const payload = {
        version: 1,
        tenantId: TENANT_ID || "",
        stateSlug: String(stateSlug || ""),
        updatedAt: new Date().toISOString(),
        runIdLast: RUN_ID,
        processed: {
            counties: Array.from(checkpointState?.countyProcessedSet || []),
            cities: Array.from(checkpointState?.cityProcessedSet || []),
        },
    };
    await fs.writeFile(tmpPath, JSON.stringify(payload), "utf8");
    await fs.rename(tmpPath, filePath);
}

function isStatusTrue(val) {
    const s = String(val ?? "").trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y";
}

async function readJson(filePath) {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
}

async function listOutStates() {
    const entries = await fs.readdir(OUT_ROOT, { withFileTypes: true }).catch(() => []);
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const states = [];
    for (const slug of dirs) {
        if (slug === "checkpoints") continue;
        const p = path.join(OUT_ROOT, slug, `${slug}.json`);
        try {
            await fs.access(p);
            states.push({ slug, jsonPath: p });
        } catch {
            // ignore
        }
    }
    states.sort((a, b) => a.slug.localeCompare(b.slug));
    return states;
}

// ---------- Consistencia County/Parish ----------
function ensureSuffix(name, suffixLower) {
    const s = String(name || "").trim();
    if (!s) return "";
    if (s.toLowerCase().endsWith(suffixLower)) return s;
    return `${s} ${suffixLower[0].toUpperCase()}${suffixLower.slice(1)}`;
}

function getCountyLabelFrom(obj) {
    if (!obj) return "";
    if (obj?.countyName) return ensureSuffix(obj.countyName, "county");
    if (obj?.parishName) return ensureSuffix(obj.parishName, "parish");
    if (obj?.name) return String(obj.name).trim();
    return "";
}


// =====================
// CORE: process one entity (county/city)
// =====================
async function processOneAccount({
    entity,
    parentCounty,
    stateSlug,
    stateName,
    countyTabIndex,
    cityTabIndex,
}) {
    const isCity = entity.type === "city";
    const tabIndex = isCity ? cityTabIndex : countyTabIndex;

    // ✅ Composite keys
    const countyName = getCountyLabelFrom(parentCounty) || getCountyLabelFrom(entity) || "";
    const cityName = String(entity?.cityName || "").trim();

    const keyHeaders = isCity ? ["State", "County", "City"] : ["State", "County"];
    const keyValuesMap = isCity
        ? { State: stateName, County: countyName, City: cityName }
        : { State: stateName, County: countyName };

    const sheetKey = makeCompositeKey(keyHeaders, keyValuesMap);
    const rowInfo = tabIndex.mapByKeyValue.get(sheetKey);

    if (!rowInfo) {
        console.log(`⚠️ Sheet row not found for key="${sheetKey}" -> SKIP (no update)`);
        return { skipped: true, reason: "sheet_row_missing" };
    }

    const statusIdx = tabIndex.headerMap.get("Status");
    const statusVal = rowInfo.row?.[statusIdx];

    if (isStatusTrue(statusVal)) {
        console.log(`⏭️ SKIP Status TRUE -> key="${sheetKey}"`);
        return { skipped: true, reason: "status_true" };
    }

    const body = entity?.body;
    if (!body?.name) {
        console.log(`⚠️ Missing body.name -> SKIP key="${sheetKey}"`);
        return { skipped: true, reason: "missing_body" };
    }

    // ===== 1) CREATE LOCATION
    console.log(
        `🚀 Creating ${isCity ? "CITY" : "COUNTY"} -> ${body.name} | key="${sheetKey}"`
    );

    // Start Twilio closure in background after create; do not block GHL token/custom-values path.
    let twilioStepPromise = Promise.resolve();

    let created = null;
    if (isDryRun) {
        created = { id: `dry-${Date.now()}`, name: body.name };
        console.log("🟡 DRY RUN: skipping GHL create");
    } else {
        const maxAttempts = 1 + MAX_SUBACCOUNT_RECOVERY_RETRIES;
        let createErr = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await ghlThrottle();
                created = await ghlFetch("/locations/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                createErr = null;
                break;
            } catch (e) {
                createErr = e;
                if (attempt >= maxAttempts || !isTwilioSubaccountLimitError(e)) {
                    break;
                }
                console.log(
                    `⚠️ Subaccount limit detected on create (attempt ${attempt}/${maxAttempts}). Recovering capacity from previous Twilio account...`
                );
                const recovered = await tryFreeTwilioCapacityFromPreviousAccount();
                if (!recovered) break;
                await sleep(1200);
            }
        }
        if (createErr) throw createErr;
    }

    const locationId = created?.id;
    if (!locationId) {
        console.log("❌ No locationId returned -> STOP this account");
        return { skipped: true, reason: "no_location_id" };
    }
    LAST_SUCCESSFUL_LOCATION_NAME = String(created?.name || body?.name || LAST_SUCCESSFUL_LOCATION_NAME || "");

    // ===== 2) TWILIO: match & close (64 chars safe) - non-blocking for faster run
    twilioStepPromise = (async () => {
        try {
            if (!ENABLE_TWILIO_CLOSE) {
                if (DEBUG) console.log("⏭️ Twilio step disabled (DELTA_ENABLE_TWILIO_CLOSE=0)");
                return;
            }
            if (isDryRun) {
                if (DEBUG) console.log("🟡 DRY RUN: skipping Twilio close");
                return;
            }

            const twilioLookupName = String(created?.name || "").slice(0, 64);
            const twilioAcc = await withTimeout(
                findTwilioAccountByFriendlyName(twilioLookupName, {
                    exact: true,
                    limit: FAST_MODE ? 60 : 200,
                }),
                TWILIO_LOOKUP_TIMEOUT_MS,
                `Twilio lookup timeout (${TWILIO_LOOKUP_TIMEOUT_MS}ms) for "${twilioLookupName}"`
            );

            if (!twilioAcc) {
                if (DEBUG) console.log("⚠️ Twilio: no match found (first 64 chars):", twilioLookupName);
                return;
            }

            if (DEBUG) {
                console.log("✅ Twilio match:", {
                    sid: twilioAcc.sid,
                    friendlyName: twilioAcc.friendlyName,
                    status: twilioAcc.status,
                });
            }

            const closed = await closeTwilioAccountWithRetry(
                twilioAcc.sid,
                "normal-post-create"
            );
            if (DEBUG) {
                console.log("🧨 Twilio CLOSED:", {
                    sid: closed?.sid || twilioAcc.sid,
                    status: closed?.status,
                });
            }
        } catch (e) {
            console.log("⚠️ Twilio step failed (continuing):", e?.message || e);
        }
    })();

    // ===== 3) UPDATE GOOGLE SHEET
    try {
        const updates = {
            "Account Name": String(created?.name || body?.name || ""),
            "Location Id": String(locationId || ""),
            Status: toBoolishTRUE(),
        };

        if (!isDryRun) {
            await updateRowByHeaders({
                spreadsheetId: SPREADSHEET_ID,
                sheetName: tabIndex.sheetName,
                headers: tabIndex.headers,
                rowNumber: rowInfo.rowNumber,
                updatesByHeader: updates,
            });
        }

        // update in-memory row
        const accIdx = tabIndex.headerMap.get("Account Name");
        const locIdx = tabIndex.headerMap.get("Location Id");
        const stIdx = tabIndex.headerMap.get("Status");

        if (rowInfo.row && accIdx !== undefined) rowInfo.row[accIdx] = updates["Account Name"];
        if (rowInfo.row && locIdx !== undefined) rowInfo.row[locIdx] = updates["Location Id"];
        if (rowInfo.row && stIdx !== undefined) rowInfo.row[stIdx] = updates.Status;

        console.log(
            `🧾 Sheet updated (${tabIndex.sheetName}) row=${rowInfo.rowNumber}: Account Name + Location Id + Status TRUE`
        );
    } catch (e) {
        console.log("⚠️ Sheet update failed:", e?.message || e);
    }

    // Ensure Twilio async step finishes before moving to next account.
    try {
        await withTimeout(
            twilioStepPromise,
            TWILIO_STEP_TIMEOUT_MS,
            `Twilio step timeout (${TWILIO_STEP_TIMEOUT_MS}ms) for locationId=${locationId}`
        );
    } catch (e) {
        console.log("⚠️ Twilio step timeout/failed (continuing):", e?.message || e);
    }

    return { created: true, locationId };
}

// =====================
// STATE scope counting for progress totals
// =====================
function countEntitiesInStateJson(stateJson) {
    const stateSlug = stateJson?.stateSlug || "";
    const stateName = stateJson?.stateName || stateJson?.name || "";
    const pr = isPR(stateSlug, stateName);

    const counties = Array.isArray(stateJson?.counties) ? stateJson.counties : [];
    let countiesTotal = 0;
    let citiesTotal = 0;

    for (const county of counties) {
        const cities = Array.isArray(county?.cities) ? county.cities : [];
        citiesTotal += cities.length;
        if (!pr) countiesTotal += 1;
    }

    return { countiesTotal, citiesTotal, allTotal: countiesTotal + citiesTotal };
}

// =====================
// RUN STATE
// =====================
async function runState({
    slug,
    jsonPath,
    countyTabIndex,
    cityTabIndex,
    progressTotals,
    progressDone,
}) {
    const stateJson = await readJson(jsonPath);

    const stateSlug = stateJson.stateSlug || slug;
    const stateName = stateJson.stateName || stateJson.name || slug;

    const counties = Array.isArray(stateJson.counties) ? stateJson.counties : [];
    const pr = isPR(stateSlug, stateName);

    console.log(`\n🏁 RUN STATE: ${stateSlug} | counties=${counties.length} | RUN_ID=${RUN_ID}`);
    console.log(`Throttle: GHL_RPM=${GHL_RPM} => min ${MIN_MS_BETWEEN_GHL_CALLS}ms between calls`);
    console.log(`Fast mode: ${FAST_MODE ? "ON" : "OFF"}`);
    console.log(`Account guards: timeout=${ACCOUNT_PROCESS_TIMEOUT_MS}ms | retries=${ACCOUNT_MAX_RETRIES}`);
    console.log(`Twilio guards: lookup=${TWILIO_LOOKUP_TIMEOUT_MS}ms | close=${TWILIO_CLOSE_TIMEOUT_MS}ms | step=${TWILIO_STEP_TIMEOUT_MS}ms`);
    console.log(`Mode: ${isDryRun ? "DRY" : "LIVE"} | Debug: ${DEBUG ? "ON" : "OFF"}\n`);

    let countyCreated = 0;
    let cityCreated = 0;
    let skipped = 0;
    let resumed = 0;
    const checkpointRaw = await loadStateCheckpoint(stateSlug);
    const checkpointState = {
        countyProcessedSet: new Set(
            Array.isArray(checkpointRaw?.processed?.counties) ? checkpointRaw.processed.counties : []
        ),
        cityProcessedSet: new Set(
            Array.isArray(checkpointRaw?.processed?.cities) ? checkpointRaw.processed.cities : []
        ),
        dirtyCount: 0,
    };
    if (CHECKPOINT_ENABLED && CHECKPOINT_AUTO_RESUME) {
        const hasResumeData =
            checkpointState.countyProcessedSet.size > 0 || checkpointState.cityProcessedSet.size > 0;
        if (hasResumeData) {
            console.log(
                `🔁 Resume checkpoint loaded (${stateSlug}) counties=${checkpointState.countyProcessedSet.size} cities=${checkpointState.cityProcessedSet.size}`
            );
        }
    }

    async function checkpointMarkDone({ kind, countyName = "", cityName = "" }) {
        if (!CHECKPOINT_ENABLED) return;
        const key = makeCheckpointItemKey({ kind, stateSlug, countyName, cityName });
        const targetSet = kind === "county" ? checkpointState.countyProcessedSet : checkpointState.cityProcessedSet;
        if (targetSet.has(key)) return;
        targetSet.add(key);
        checkpointState.dirtyCount++;
        if (checkpointState.dirtyCount >= CHECKPOINT_FLUSH_EVERY) {
            await saveStateCheckpoint(stateSlug, checkpointState);
            checkpointState.dirtyCount = 0;
        }
    }

    for (let i = 0; i < counties.length; i++) {
        const county = counties[i];
        const countyName = getCountyLabelFrom(county) || "Unknown County";
        const countyLabel = `[${i + 1}/${counties.length}] ${countyName}`;

        // PR: no counties
        if (!pr) {
            console.log(`\n🧩 COUNTY ${countyLabel}`);
            const countyCheckpointKey = makeCheckpointItemKey({
                kind: "county",
                stateSlug,
                countyName,
            });
            const countyAlreadyDone =
                CHECKPOINT_ENABLED &&
                CHECKPOINT_AUTO_RESUME &&
                checkpointState.countyProcessedSet.has(countyCheckpointKey);
            if (countyAlreadyDone) {
                resumed++;
                progressDone.counties += 1;
                progressDone.all += 1;
                emitProgress({
                    totals: progressTotals,
                    done: progressDone,
                    last: { kind: "county", state: stateSlug, county: countyName, action: "resume-skip" },
                    message: `🧩 ${countyName} • resume`,
                });
            } else {
                // progress: we are about to process a county item
                emitProgress({
                    totals: progressTotals,
                    done: progressDone,
                    last: { kind: "county", state: stateSlug, county: countyName, action: "start" },
                    message: `🧩 ${countyName} • start`,
                });

                if (county?.body?.name) {
                    try {
                        const r = await processOneAccountWithRecovery({
                            entity: { ...county, countyName, type: "county" },
                            parentCounty: null,
                            stateSlug,
                            stateName,
                            countyTabIndex,
                            cityTabIndex,
                        });
                        if (r?.created) countyCreated++;
                        else skipped++;
                        await checkpointMarkDone({ kind: "county", countyName });
                    } catch (e) {
                        console.log(`❌ COUNTY failed after retries (${countyName}):`, formatErrWithDetails(e));
                        skipped++;
                    }
                } else {
                    console.log(`⚠️ COUNTY missing body -> SKIP create county: ${countyLabel}`);
                    skipped++;
                    await checkpointMarkDone({ kind: "county", countyName });
                }

                // mark county done
                progressDone.counties += 1;
                progressDone.all += 1;

                emitProgress({
                    totals: progressTotals,
                    done: progressDone,
                    last: { kind: "county", state: stateSlug, county: countyName, action: "done" },
                    message: `🧩 ${countyName} • done`,
                });
            }
        }

        const cities = Array.isArray(county?.cities) ? county.cities : [];
        if (!cities.length) continue;

        console.log(`\n🏙️  Cities for ${countyLabel}: ${cities.length}`);

        for (let c = 0; c < cities.length; c++) {
            const city = cities[c];
            const cityName = city?.cityName || city?.name || "Unknown City";
            const cityCheckpointKey = makeCheckpointItemKey({
                kind: "city",
                stateSlug,
                countyName,
                cityName,
            });
            if (CHECKPOINT_ENABLED && CHECKPOINT_AUTO_RESUME && checkpointState.cityProcessedSet.has(cityCheckpointKey)) {
                resumed++;
                progressDone.cities += 1;
                progressDone.all += 1;
                emitProgress({
                    totals: progressTotals,
                    done: progressDone,
                    last: { kind: "city", state: stateSlug, county: countyName, city: cityName, action: "resume-skip" },
                    message: `🏙️ ${cityName} • resume`,
                });
                continue;
            }

            emitProgress({
                totals: progressTotals,
                done: progressDone,
                last: { kind: "city", state: stateSlug, county: countyName, city: cityName, action: "start" },
                message: `🏙️ ${cityName} • start`,
            });

            if (!city?.body?.name) {
                console.log(`⚠️ CITY missing body -> SKIP: ${cityName}`);
                skipped++;
                await checkpointMarkDone({ kind: "city", countyName, cityName });

                // mark city done (even if skipped)
                progressDone.cities += 1;
                progressDone.all += 1;

                emitProgress({
                    totals: progressTotals,
                    done: progressDone,
                    last: { kind: "city", state: stateSlug, county: countyName, city: cityName, action: "skip(missing body)" },
                    message: `🏙️ ${cityName} • skip`,
                });
                continue;
            }

            let r = null;
            try {
                r = await processOneAccountWithRecovery({
                    entity: { ...city, cityName, type: "city" },
                    parentCounty: { ...county, countyName },
                    stateSlug,
                    stateName,
                    countyTabIndex,
                    cityTabIndex,
                });
                if (r?.created) cityCreated++;
                else skipped++;
                await checkpointMarkDone({ kind: "city", countyName, cityName });
            } catch (e) {
                console.log(`❌ CITY failed after retries (${cityName}):`, formatErrWithDetails(e));
                skipped++;
            }

            progressDone.cities += 1;
            progressDone.all += 1;

            emitProgress({
                totals: progressTotals,
                done: progressDone,
                last: { kind: "city", state: stateSlug, county: countyName, city: cityName, action: r?.created ? "created" : "done" },
                message: `🏙️ ${cityName} • ${r?.created ? "created" : "done"}`,
            });
        }
    }
    if (CHECKPOINT_ENABLED && checkpointState.dirtyCount > 0) {
        await saveStateCheckpoint(stateSlug, checkpointState);
        checkpointState.dirtyCount = 0;
    }

    console.log(
        `\n✅ STATE DONE ${stateSlug} | countyCreated=${countyCreated} | cityCreated=${cityCreated} | skipped=${skipped} | resumed=${resumed}\n`
    );
    return { countyCreated, cityCreated, skipped, resumed };
}

// =====================
// Target selection (UI vs interactive)
// =====================
function parseStateArgIntoSlugs(v) {
    const s = String(v || "").trim();
    if (!s) return null;

    const low = s.toLowerCase();
    if (low === "all" || low === "*") return { mode: "all", slugs: [] };

    // allow: "Alabama,Florida" or "alabama,florida"
    const parts = s
        .split(",")
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .map((x) =>
            x
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/\s+/g, "-")
        );

    if (!parts.length) return null;
    return { mode: "list", slugs: parts };
}

async function promptStateChoice(states) {
    console.log("\nAvailable states (scripts/out/<state>/<state>.json):");
    states.forEach((s, i) => console.log(`  ${i + 1}) ${s.slug}`));
    console.log(`  all) Run ALL states`);

    const rl = readline.createInterface({ input, output });
    const answer = (
        await rl.question("\nType state number OR state slug (e.g. 1 or florida or all): ")
    ).trim();
    rl.close();

    if (!answer) return null;
    if (answer.toLowerCase() === "all") return { mode: "all" };

    const asNum = Number(answer);
    if (!Number.isNaN(asNum) && asNum >= 1 && asNum <= states.length) {
        return { mode: "one", slug: states[asNum - 1].slug };
    }

    const exact = states.find((s) => s.slug === answer);
    if (exact) return { mode: "one", slug: exact.slug };

    return null;
}

// =====================
// MAIN
// =====================
async function main() {
    if (!SPREADSHEET_ID) {
        throw new Error("Missing GOOGLE_SHEET_ID in .env");
    }

    console.log("phase:init -> loadTokens start");
    await loadTokens();
    console.log("phase:init -> loadTokens done");
    if (CHECKPOINT_ENABLED) {
        await resetCheckpointsIfRequested();
        await ensureCheckpointDir();
        console.log(
            `phase:init -> checkpoint dir=${CHECKPOINT_DIR} resume=${CHECKPOINT_AUTO_RESUME ? "on" : "off"}`
        );
    }

    console.log(`phase:init -> scanning state files in ${OUT_ROOT}`);
    const states = await listOutStates();
    if (!states.length) {
        throw new Error(
            `No states found in ${OUT_ROOT} (expected scripts/out/<slug>/<slug>.json)`
        );
    }
    console.log(`phase:init -> states discovered=${states.length}`);

    // ✅ Determine targets: UI arg takes precedence
    let targets = [];

    const parsedArg = parseStateArgIntoSlugs(STATE_ARG);
    if (parsedArg) {
        if (parsedArg.mode === "all") {
            targets = states;
        } else {
            const wanted = new Set(parsedArg.slugs);
            targets = states.filter((s) => wanted.has(s.slug));
            if (!targets.length) {
                throw new Error(
                    `No states matched --state="${STATE_ARG}". Available slugs example: ${states
                        .slice(0, 10)
                        .map((x) => x.slug)
                        .join(", ")}`
                );
            }
        }
    } else {
        // fallback interactive
        const choice = await promptStateChoice(states);
        if (!choice) throw new Error("State not found / invalid selection.");

        targets =
            choice.mode === "all"
                ? states
                : [states.find((s) => s.slug === choice.slug)].filter(Boolean);
    }

    console.log(`\nphase:init -> loading Google Sheet tab indexes...`);
    console.log(
        `phase:init -> sheets load timeout=${SHEETS_LOAD_TIMEOUT_MS}ms retries=${SHEETS_LOAD_MAX_RETRIES}`
    );

    // ✅ IMPORTANT: composite keys
    console.log(`phase:init -> loading tabs in parallel (county+city)...`);
    const countyLoadStartedAt = Date.now();
    const cityLoadStartedAt = Date.now();
    const [countyTabIndex, cityTabIndex] = await Promise.all([
        (async () => {
            console.log(`phase:init -> county tab start (${COUNTY_TAB})`);
            const county = await loadSheetTabIndexWithRecovery({
                spreadsheetId: SPREADSHEET_ID,
                sheetName: COUNTY_TAB,
                range: "A:Z",
                keyHeaders: ["State", "County"],
            });
            console.log(`phase:init -> county tab loaded (${county.rows.length} rows)`);
            console.log(`phase:init -> county load duration=${Date.now() - countyLoadStartedAt}ms`);
            return county;
        })(),
        (async () => {
            console.log(`phase:init -> city tab start (${CITY_TAB})`);
            const city = await loadSheetTabIndexWithRecovery({
                spreadsheetId: SPREADSHEET_ID,
                sheetName: CITY_TAB,
                range: "A:Z",
                keyHeaders: ["State", "County", "City"],
            });
            console.log(`phase:init -> city tab loaded (${city.rows.length} rows)`);
            console.log(`phase:init -> city load duration=${Date.now() - cityLoadStartedAt}ms`);
            return city;
        })(),
    ]);

    // sanity required headers for update
    for (const tab of [countyTabIndex, cityTabIndex]) {
        for (const h of ["Status", "Location Id", "Account Name"]) {
            if (!tab.headerMap.has(h)) {
                throw new Error(`Sheet tab "${tab.sheetName}" missing required header "${h}"`);
            }
        }
    }

    console.log(`\n🚀 RUN START | mode=${isDryRun ? "DRY" : "LIVE"} | targets=${targets.length}`);
    console.log(`Tabs: Counties="${COUNTY_TAB}" | Cities="${CITY_TAB}"`);
    console.log(`RunId(local)=${RUN_ID} | Throttle min=${MIN_MS_BETWEEN_GHL_CALLS}ms\n`);

    // ✅ compute totals for progress across ALL targets
    let totals = { all: 0, counties: 0, cities: 0 };
    for (const t of targets) {
        const st = await readJson(t.jsonPath);
        const cnt = countEntitiesInStateJson(st);
        totals.all += cnt.allTotal;
        totals.counties += cnt.countiesTotal;
        totals.cities += cnt.citiesTotal;
    }

    const done = { all: 0, counties: 0, cities: 0 };

    emitProgressInit({
        totals,
        message: `Run Delta System (${targets.length} state(s))`,
    });

    let totalCounty = 0;
    let totalCity = 0;
    let totalSkipped = 0;
    let totalResumed = 0;

    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];

        console.log(`\n⏳ [${i + 1}/${targets.length}] Processing: ${t.slug}`);

        emitProgress({
            totals,
            done,
            last: { kind: "state", state: t.slug, action: "start" },
            message: `State ${t.slug} • start`,
        });

        const summary = await runState({
            slug: t.slug,
            jsonPath: t.jsonPath,
            countyTabIndex,
            cityTabIndex,
            progressTotals: totals,
            progressDone: done,
        });

        totalCounty += summary.countyCreated;
        totalCity += summary.cityCreated;
        totalSkipped += summary.skipped;
        totalResumed += Number(summary.resumed || 0);

        emitProgress({
            totals,
            done,
            last: { kind: "state", state: t.slug, action: "done" },
            message: `State ${t.slug} • done`,
        });
    }

    const elapsedMs = Date.now() - RUN_STARTED_AT;

    console.log("--------------------------------------------------");
    console.log(
        `🎉 DONE | counties=${totalCounty} | cities=${totalCity} | skipped=${totalSkipped} | resumed=${totalResumed} | time=${(
            elapsedMs / 1000
        ).toFixed(1)}s`
    );

    emitProgressEnd({ totals, done, ok: true });
}

main().catch((e) => {
    console.error("❌ Fatal:", e?.message || e);
    if (DEBUG) console.dir(e, { depth: 6 });

    try {
        emitProgressEnd({
            totals: { all: 1, counties: 0, cities: 0 },
            done: { all: 1, counties: 0, cities: 0 },
            ok: false,
            error: e?.message || String(e),
        });
    } catch { }

    process.exit(1);
});
