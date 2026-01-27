// services/sheetsClient.js
import fs from "fs/promises";
import path from "path";
import { google } from "googleapis";

/* =========================
   Utils
========================= */

function norm(str) {
    return String(str || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function isFilled(v) {
    return v !== null && v !== undefined && String(v).trim() !== "";
}

function colToLetter(colIndex0) {
    // 0 -> A, 25 -> Z, 26 -> AA ...
    let n = colIndex0 + 1;
    let s = "";
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

/* =========================
   Auth / Clients
========================= */

async function resolveKeyFile() {
    const keyFile =
        process.env.GOOGLE_SERVICE_ACCOUNT_KEYFILE ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        "./google-cloud.json";

    const absKeyFile = path.isAbsolute(keyFile)
        ? keyFile
        : path.join(process.cwd(), keyFile);

    await fs.access(absKeyFile).catch(() => {
        throw new Error(
            `Google Cloud keyfile not found: ${absKeyFile}\n` +
            `Set GOOGLE_SERVICE_ACCOUNT_KEYFILE (or GOOGLE_APPLICATION_CREDENTIALS) in .env\n` +
            `or place google-cloud.json at repo root.`
        );
    });

    return absKeyFile;
}

async function getGoogleAuth() {
    const absKeyFile = await resolveKeyFile();

    // ✅ IMPORTANTE:
    // - spreadsheets: leer/escribir contenido
    // - drive.file: crear archivos (spreadsheets) y editarlos si los creó el SA
    //   (Si quieres poder editar CUALQUIER sheet que te compartan, usa drive)
    const scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
    ];

    return new google.auth.GoogleAuth({
        keyFile: absKeyFile,
        scopes,
    });
}

async function getSheetsClient() {
    const auth = await getGoogleAuth();
    return google.sheets({ version: "v4", auth });
}

async function getDriveClient() {
    const auth = await getGoogleAuth();
    return google.drive({ version: "v3", auth });
}

/* =========================
   Read / Index (tu código)
========================= */

/**
 * Lee TODA la data de la tab (A:Z) y crea un índice por Account Name.
 * - header row = primera fila
 * - rowNumber = 1-based (como Google Sheets)
 */
export async function loadSheetIndex({
    spreadsheetId,
    sheetName,
    range = "A:Z",
    accountNameHeader = "Account Name",
    locationIdHeader = "Location Id",
}) {
    if (!spreadsheetId) throw new Error("Missing spreadsheetId");
    if (!sheetName) throw new Error("Missing sheetName");

    const sheets = await getSheetsClient();
    const a1 = `${sheetName}!${range}`;

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: a1,
        valueRenderOption: "UNFORMATTED_VALUE",
    });

    const values = res?.data?.values || [];
    if (values.length === 0) {
        return {
            sheetName,
            range: a1,
            headers: [],
            headerMap: new Map(),
            rows: [],
            mapByAccountName: new Map(),
            accountNameCol: -1,
            locationIdCol: -1,
        };
    }

    const headers = values[0].map((h) => String(h || "").trim());
    const headerMap = new Map(headers.map((h, i) => [h, i]));

    const accountNameCol = headerMap.get(accountNameHeader);
    const locationIdCol = headerMap.get(locationIdHeader);

    if (accountNameCol === undefined) {
        throw new Error(
            `Sheet "${sheetName}" missing header "${accountNameHeader}". Found headers: ${headers.join(
                ", "
            )}`
        );
    }
    if (locationIdCol === undefined) {
        throw new Error(
            `Sheet "${sheetName}" missing header "${locationIdHeader}". Found headers: ${headers.join(
                ", "
            )}`
        );
    }

    const rows = values.slice(1);

    const mapByAccountName = new Map();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || [];
        const rowNumber = i + 2; // +1 header, +1 1-based
        const accountName = row[accountNameCol];
        if (!isFilled(accountName)) continue;

        const key = norm(accountName);
        const locationId = row[locationIdCol];

        const existing = mapByAccountName.get(key);
        if (!existing) {
            mapByAccountName.set(key, {
                rowNumber,
                accountName,
                locationId: isFilled(locationId) ? String(locationId).trim() : "",
                row,
            });
        } else {
            if (!isFilled(existing.locationId) && isFilled(locationId)) {
                mapByAccountName.set(key, {
                    rowNumber,
                    accountName,
                    locationId: String(locationId).trim(),
                    row,
                });
            }
        }
    }

    return {
        sheetName,
        range: a1,
        headers,
        headerMap,
        rows,
        mapByAccountName,
        accountNameCol,
        locationIdCol,
    };
}

/**
 * Actualiza el Location Id en una fila existente (por rowNumber).
 */
export async function updateLocationIdInRow({
    spreadsheetId,
    sheetName,
    locationIdColIndex0,
    rowNumber,
    locationId,
}) {
    if (!spreadsheetId) throw new Error("Missing spreadsheetId");
    if (!sheetName) throw new Error("Missing sheetName");
    if (locationIdColIndex0 < 0) throw new Error("Invalid locationIdColIndex0");
    if (!rowNumber) throw new Error("Missing rowNumber");

    const sheets = await getSheetsClient();

    const colLetter = colToLetter(locationIdColIndex0);
    const rangeA1 = `${sheetName}!${colLetter}${rowNumber}`;

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: rangeA1,
        valueInputOption: "RAW",
        requestBody: { values: [[locationId]] },
    });

    return { rangeA1, rowNumber, locationId };
}

/**
 * Append row al final.
 */
export async function appendRow({ spreadsheetId, sheetName, valuesArray }) {
    const sheets = await getSheetsClient();

    const res = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [valuesArray] },
    });

    const updatedRange = res?.data?.updates?.updatedRange || "";
    let rowNumber = null;
    const m = updatedRange.match(/![A-Z]+(\d+):/);
    if (m) rowNumber = Number(m[1]);

    return { updatedRange, rowNumber };
}

/**
 * Construye un row array alineado a headers.
 */
export function buildRowFromHeaders(headers, dataMap) {
    return headers.map((h) => {
        const v = dataMap[h];
        return v === undefined || v === null ? "" : v;
    });
}

export { norm, isFilled };

/* =========================
   ✅ NEW: Create spreadsheet + write rows
========================= */

/**
 * Crea un Google Spreadsheet (archivo nuevo).
 * @param {string} title - nombre del spreadsheet
 * @param {string[]} sheetTitles - tabs a crear (opcional)
 * @returns { spreadsheetId, spreadsheetUrl }
 */
export async function createSpreadsheet({ title, sheetTitles = ["Sheet1"] }) {
    if (!title) throw new Error("title is required");

    const sheets = await getSheetsClient();

    const res = await sheets.spreadsheets.create({
        requestBody: {
            properties: { title },
            sheets: sheetTitles.map((t) => ({ properties: { title: t } })),
        },
    });

    return {
        spreadsheetId: res.data.spreadsheetId,
        spreadsheetUrl: res.data.spreadsheetUrl,
    };
}

/**
 * Asegura que exista un tab con ese nombre; si no existe, lo crea.
 * @returns { sheetId }
 */
export async function upsertSheetTab({ spreadsheetId, sheetName }) {
    if (!spreadsheetId) throw new Error("Missing spreadsheetId");
    if (!sheetName) throw new Error("Missing sheetName");

    const sheets = await getSheetsClient();

    const meta = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets(properties(sheetId,title))",
    });

    const found = (meta.data.sheets || []).find(
        (s) => s?.properties?.title === sheetName
    );
    if (found) return { sheetId: found.properties.sheetId, created: false };

    const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
    });

    const reply = addRes?.data?.replies?.[0]?.addSheet?.properties;
    return { sheetId: reply?.sheetId, created: true };
}

/**
 * Escribe un bloque completo de filas en un rango (RAW).
 * Ejemplo: rangeA1 = "TabName!A1"
 */
export async function writeRows({
    spreadsheetId,
    rangeA1,
    rows, // array de arrays
}) {
    if (!spreadsheetId) throw new Error("Missing spreadsheetId");
    if (!rangeA1) throw new Error("Missing rangeA1");
    if (!Array.isArray(rows)) throw new Error("rows must be an array");

    const sheets = await getSheetsClient();

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: rangeA1,
        valueInputOption: "RAW",
        requestBody: { values: rows },
    });

    return { rangeA1, rowsWritten: rows.length };
}

/**
 * (Opcional) Devuelve el email del Service Account desde el keyfile
 * útil para "Share" el spreadsheet si lo necesitas.
 */
export async function getServiceAccountEmail() {
    const absKeyFile = await resolveKeyFile();
    const raw = await fs.readFile(absKeyFile, "utf8");
    const json = JSON.parse(raw);
    return json.client_email || "";
}

/**
 * (Opcional) Comparte el spreadsheet con un email usando Drive API.
 * Requiere scopes de Drive (drive.file o drive).
 */
export async function shareSpreadsheet({
    spreadsheetId,
    email,
    role = "writer", // writer | reader
}) {
    if (!spreadsheetId) throw new Error("Missing spreadsheetId");
    if (!email) throw new Error("Missing email");

    const drive = await getDriveClient();

    await drive.permissions.create({
        fileId: spreadsheetId,
        sendNotificationEmail: false,
        requestBody: {
            type: "user",
            role,
            emailAddress: email,
        },
    });

    return { spreadsheetId, email, role };
}

/**
 * ✅ Ejemplo práctico:
 * Crea un spreadsheet nuevo desde un JSON file local (rutas)
 * - routesFile debe ser un JSON tipo: [{...},{...}] o { rows:[...] }
 */
export async function createSpreadsheetFromRoutesFile({
    title,
    sheetName = "Routes",
    routesFilePath,
    headers = ["Route", "URL"],
}) {
    if (!title) throw new Error("title is required");
    if (!routesFilePath) throw new Error("routesFilePath is required");

    const abs = path.isAbsolute(routesFilePath)
        ? routesFilePath
        : path.join(process.cwd(), routesFilePath);

    const raw = await fs.readFile(abs, "utf8");
    const data = JSON.parse(raw);

    // Normaliza a rows
    let rows = [];
    if (Array.isArray(data)) {
        // si es array de objetos, intenta mapear
        rows = data.map((x) => headers.map((h) => (x?.[h] ?? x?.[norm(h)] ?? "")));
    } else if (Array.isArray(data?.rows)) {
        rows = data.rows;
    }

    // 1) create
    const created = await createSpreadsheet({ title, sheetTitles: [sheetName] });

    // 2) write header + rows
    await writeRows({
        spreadsheetId: created.spreadsheetId,
        rangeA1: `${sheetName}!A1`,
        rows: [headers, ...rows],
    });

    return created;
}
