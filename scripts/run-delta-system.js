// scripts/run-create-subaccounts.js
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { loadTokens, getTokens } from "../services/tokenStore.js";
import { ghlFetch } from "../services/ghlClient.js";

import {
    findTwilioAccountByFriendlyName,
    closeTwilioAccount,
} from "../services/twilioClient.js";

import {
    loadSheetIndex,
    updateLocationIdInRow,
    appendRow,
    buildRowFromHeaders,
    norm,
    isFilled,
} from "../services/sheetsClient.js";

import { getLocationAccessToken } from "../services/ghlLocationToken.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   Helpers: Checkpoints
========================= */

function getCheckpointPath(stateKey) {
    return path.join(process.cwd(), "scripts/out/checkpoints", `${stateKey || "unknown"}.json`);
}

async function readCheckpoint(stateKey) {
    try {
        const raw = await fs.readFile(getCheckpointPath(stateKey), "utf8");
        return JSON.parse(raw);
    } catch {
        return { createdByCountyKey: {} };
    }
}

async function writeCheckpoint(stateKey, data) {
    const p = getCheckpointPath(stateKey);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

function countyKey(it) {
    const s = (it?.stateKey || it?.state || "").toLowerCase();
    const c = (it?.countyName || "").toLowerCase();
    const d = (it?.countyDomain || "").toLowerCase();
    return `${s}::${c}::${d}`;
}

/* =========================
   Main
========================= */

const RUN_ID = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const RUN_STARTED_AT = Date.now();

// Uso:
// node scripts/run-delta-system.js scripts/out/fl/ghl-create-counties-XXXX.json [--dry-run] [--no-resume]
async function main() {
    const inputPath = process.argv[2];
    const isDryRun = process.argv.includes("--dry-run");
    const resume = !process.argv.includes("--no-resume"); // default ON

    if (!inputPath) {
        console.error("❌ Usage: node scripts/run-delta-system.js <path-to-json> [--dry-run] [--no-resume]");
        process.exit(1);
    }

    await loadTokens();

    const abs = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);

    const raw = await fs.readFile(abs, "utf8");
    const json = JSON.parse(raw);
    const items = json?.items || [];

    // =========================
    // STEP #1: Load Google Sheet (dedupe)
    // =========================
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = process.env.GOOGLE_SHEET_TAB;

    if (!spreadsheetId || !sheetName) {
        throw new Error("Missing GOOGLE_SHEET_ID or GOOGLE_SHEET_TAB in .env");
    }

    console.log(`\n🚀 RUN ID: ${RUN_ID}`);
    console.log(`State: ${json.stateKey} (${json.stateName})`);
    console.log(`Items: ${items.length}`);
    console.log(`Input: ${abs}`);
    console.log(`Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
    console.log(`Resume: ${resume ? "ON" : "OFF"}`);
    console.log(`Sheet: ${sheetName} (id from GOOGLE_SHEET_ID)`);
    console.log("--------------------------------------------------\n");

    console.log("📄 Loading Google Sheet index (Account Name -> Location Id) ...");
    const sheetIndex = await loadSheetIndex({
        spreadsheetId,
        sheetName,
        range: "A:Z",
        accountNameHeader: "Account Name",
        locationIdHeader: "Location Id",
    });
    console.log(`✅ Sheet loaded: rows=${sheetIndex.rows.length}, indexed=${sheetIndex.mapByAccountName.size}\n`);

    const checkpoint = await readCheckpoint(json.stateKey);

    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const label = `${i + 1}/${items.length} | ${it.countyName}`;
        const key = countyKey(it);
        const countyStart = Date.now();

        // Nombre EXACTO que vamos a crear en GHL (base para dedupe)
        const accountName = it?.body?.name;
        const accountKey = norm(accountName);

        // =========================
        // DEDUPE RULE #1: Sheet first (si tiene Location Id -> skip)
        // =========================
        const rowInfo = sheetIndex.mapByAccountName.get(accountKey);
        if (rowInfo && isFilled(rowInfo.locationId)) {
            console.log(`⏭️ ${label} SKIPPED (sheet has Location Id) => ${rowInfo.locationId}`);
            continue;
        }

        // =========================
        // DEDUPE RULE #2: checkpoint (si ya lo creamos antes en este proyecto)
        // =========================
        if (resume && checkpoint.createdByCountyKey[key]?.locationId) {
            console.log(`⏭️ ${label} SKIPPED (checkpoint) locationId:`, checkpoint.createdByCountyKey[key].locationId);
            continue;
        }

        try {
            /* =========================
               1) CREATE GHL LOCATION
            ========================= */

            console.log(`🚀 ${label} creating GHL location...`);

            const created = await ghlFetch("/locations/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(it.body),
            });

            console.log(`✅ ${label} locationId: ${created?.id}`);
            console.log(`🧠 GHL.name => ${created?.name}`);

            // Save checkpoint
            checkpoint.createdByCountyKey[key] = {
                countyName: it.countyName,
                countyDomain: it.countyDomain,
                locationId: created?.id,
                createdName: created?.name,
                runId: RUN_ID,
                createdAt: new Date().toISOString(),
            };
            await writeCheckpoint(json.stateKey, checkpoint);

            /* =========================
               1.5) WRITE BACK TO GOOGLE SHEET
               - If row exists: update Location Id cell
               - If row missing: append row (recommended)
            ========================= */

            if (!created?.id) {
                console.log("⚠️ No created.id, skipping Sheet update");
            } else {
                if (rowInfo?.rowNumber) {
                    // Update existing row locationId
                    await updateLocationIdInRow({
                        spreadsheetId,
                        sheetName,
                        locationIdColIndex0: sheetIndex.locationIdCol,
                        rowNumber: rowInfo.rowNumber,
                        locationId: created.id,
                    });

                    // Update in-memory index
                    rowInfo.locationId = created.id;

                    console.log(`🧾 Sheet updated: row ${rowInfo.rowNumber} Location Id => ${created.id}`);
                } else {
                    // Append row: keep it simple (only headers that exist)
                    const dataMap = {
                        "Account Name": created?.name || accountName || "",
                        "Location Id": created.id,
                    };

                    const valuesArray = buildRowFromHeaders(sheetIndex.headers, dataMap);

                    const appended = await appendRow({
                        spreadsheetId,
                        sheetName,
                        valuesArray,
                    });

                    // update in-memory index
                    sheetIndex.mapByAccountName.set(accountKey, {
                        rowNumber: appended.rowNumber,
                        accountName: created?.name || accountName,
                        locationId: created.id,
                        row: valuesArray,
                    });

                    console.log(`🧾 Sheet appended: row ${appended.rowNumber} (Location Id => ${created.id})`);
                }
            }

            /* =========================
               2) TWILIO LOOKUP
            ========================= */

            let twilioClosedSid = null;

            if (!created?.name) {
                console.log("⚠️ No GHL name, skipping Twilio");
            } else {
                console.log("🔎 Twilio: searching by friendlyName...");

                const twilioAcc = await findTwilioAccountByFriendlyName(created.name, {
                    exact: true,
                    limit: 200,
                });

                if (!twilioAcc) {
                    console.log("⚠️ Twilio: no match found");
                } else {
                    console.log("✅ Twilio match:", {
                        sid: twilioAcc.sid,
                        friendlyName: twilioAcc.friendlyName,
                        status: twilioAcc.status,
                    });

                    /* =========================
                       3) CLOSE TWILIO
                    ========================= */

                    if (isDryRun) {
                        console.log("🟡 DRY RUN: Twilio NOT closed:", twilioAcc.sid);
                    } else {
                        const closed = await closeTwilioAccount(twilioAcc.sid);
                        twilioClosedSid = closed?.sid || twilioAcc.sid;
                        console.log("🧨 Twilio CLOSED:", {
                            sid: closed.sid,
                            status: closed.status,
                        });
                    }

                    /* =========================
                       4) GET LOCATION TOKEN (AFTER TWILIO CLOSE)
                    ========================= */

                    // Nota: esto NO crea nada en GHL, solo obtiene token del location.
                    // Si falla, NO detenemos el run.
                    try {
                        const tokens = getTokens();

                        const agencyAccessToken = tokens?.access_token;
                        const companyId = tokens?.companyId || process.env.GHL_COMPANY_ID || process.env.COMPANY_ID || json?.companyId;

                        if (!agencyAccessToken) {
                            console.log("⚠️ LocationToken: missing agency access_token in tokenStore (tokens.json)");
                        } else if (!companyId) {
                            console.log("⚠️ LocationToken: missing companyId (tokens.companyId or env GHL_COMPANY_ID/COMPANY_ID)");
                        } else if (!created?.id) {
                            console.log("⚠️ LocationToken: missing created.id (locationId)");
                        } else if (isDryRun) {
                            console.log("🟡 DRY RUN: skipping LocationToken request");
                        } else {
                            console.log("🔐 LocationToken: requesting location access token...");

                            const locTok = await getLocationAccessToken({
                                companyId,
                                locationId: created.id,
                                agencyAccessToken,
                            });

                            // Guarda en checkpoint (no lo metas al Sheet a menos que luego lo pidas)
                            checkpoint.createdByCountyKey[key] = {
                                ...checkpoint.createdByCountyKey[key],
                                locationToken: locTok,
                                locationTokenFetchedAt: new Date().toISOString(),
                                twilioClosedSid: twilioClosedSid || null,
                            };
                            await writeCheckpoint(json.stateKey, checkpoint);

                            console.log("✅ LocationToken received:", {
                                hasAccessToken: Boolean(locTok?.access_token),
                                tokenType: locTok?.token_type,
                                expiresIn: locTok?.expires_in,
                            });
                        }
                    } catch (e) {
                        console.log("⚠️ LocationToken FAILED (continuing):", e?.data || e?.message || e);
                    }
                }
            }

            /* =========================
               TIMING
            ========================= */

            const countyElapsed = Date.now() - countyStart;
            console.log(`⏱️ ${label} completed in ${(countyElapsed / 1000).toFixed(2)}s\n`);
        } catch (e) {
            const countyElapsed = Date.now() - countyStart;
            console.error(
                `❌ ${label} FAILED after ${(countyElapsed / 1000).toFixed(2)}s`,
                e?.data || e?.message || e
            );
            continue;
        }
    }

    /* =========================
       TOTAL TIME
    ========================= */

    const elapsedMs = Date.now() - RUN_STARTED_AT;
    const elapsedSec = Math.round(elapsedMs / 1000);
    const elapsedMin = (elapsedSec / 60).toFixed(2);

    console.log("--------------------------------------------------");
    console.log(`⏱️ TOTAL TIME: ${elapsedSec}s (${elapsedMin} min)`);
    console.log("DONE ✅");
}

main().catch((e) => {
    console.error("❌ Fatal:", e?.message || e);
    process.exit(1);
});
