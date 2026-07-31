import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import {
  getTenantSheetConfig,
  getTenantSheetsApi,
  loadTenantSheetTabIndex,
} from "@/lib/tenantSheets";
import { listTenantStateFiles } from "@/lib/tenantStateCatalogDb";

export const runtime = "nodejs";

type Kind = "counties" | "cities";

function s(value: unknown) {
  return String(value ?? "").trim();
}

function keyPart(value: unknown) {
  return s(value)
    .toLowerCase()
    .replace(/\b(county|parish|borough|census area|municipality)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function entityKey(kind: Kind, county: unknown, city?: unknown) {
  return kind === "counties" ? keyPart(county) : `${keyPart(county)}::${keyPart(city)}`;
}

function cell(row: unknown[], headerMap: Map<string, number>, header: string) {
  const index = headerMap.get(header);
  return index === undefined ? "" : s(row[index]);
}

function columnLetter(index: number) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    output = String.fromCharCode(65 + ((value - 1) % 26)) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function jsonRecords(payload: unknown, kind: Kind) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const counties = (payload as Record<string, unknown>).counties;
  if (!Array.isArray(counties)) return [];
  const records: Array<{ key: string; county: string; city: string }> = [];
  const seen = new Set<string>();
  for (const rawCounty of counties) {
    if (!rawCounty || typeof rawCounty !== "object" || Array.isArray(rawCounty)) continue;
    const countyObject = rawCounty as Record<string, unknown>;
    const county = s(
      countyObject.countyName || countyObject.parishName || countyObject.boroughName ||
      countyObject.municipalityName || countyObject.name,
    );
    if (!county) continue;
    if (kind === "counties") {
      const key = entityKey(kind, county);
      if (!seen.has(key)) {
        seen.add(key);
        records.push({ key, county, city: "" });
      }
      continue;
    }
    if (!Array.isArray(countyObject.cities)) continue;
    for (const rawCity of countyObject.cities) {
      if (!rawCity || typeof rawCity !== "object" || Array.isArray(rawCity)) continue;
      const city = s((rawCity as Record<string, unknown>).cityName || (rawCity as Record<string, unknown>).name);
      const key = entityKey(kind, county, city);
      if (!city || seen.has(key)) continue;
      seen.add(key);
      records.push({ key, county, city });
    }
  }
  return records;
}

async function context(tenantId: string, state: string, kind: Kind) {
  const config = await getTenantSheetConfig(tenantId);
  const sheetName = kind === "counties" ? config.countyTab : config.cityTab;
  const [tab, stateFiles] = await Promise.all([
    loadTenantSheetTabIndex({
      tenantId,
      spreadsheetId: config.spreadsheetId,
      sheetName,
      range: "A:ZZ",
    }),
    listTenantStateFiles(getDbPool(), tenantId),
  ]);
  const stateFile = stateFiles.find((file) =>
    s(file.state_name).toLowerCase() === state.toLowerCase() ||
    s(file.state_slug).toLowerCase() === state.toLowerCase(),
  );
  if (!stateFile) throw new Error(`No tenant JSON found for ${state}`);
  return { config, sheetName, tab, stateFile };
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const tenantId = s(params.get("tenantId"));
    const state = s(params.get("state"));
    const kind = s(params.get("kind")) as Kind;
    if (!tenantId || !state || !["counties", "cities"].includes(kind)) {
      return NextResponse.json({ error: "tenantId, state and kind=counties|cities are required" }, { status: 400 });
    }
    const { tab, sheetName, stateFile } = await context(tenantId, state, kind);
    const json = jsonRecords(stateFile.payload, kind);
    const sheetRows = (tab.rows || []).flatMap((row, index) => {
      if (cell(row, tab.headerMap, "State").toLowerCase() !== state.toLowerCase()) return [];
      const county = cell(row, tab.headerMap, "County");
      const city = kind === "cities" ? cell(row, tab.headerMap, "City") : "";
      return [{
        rowNumber: index + 2,
        key: entityKey(kind, county, city),
        state: cell(row, tab.headerMap, "State"),
        county,
        city,
        locationId: cell(row, tab.headerMap, "Location Id"),
        status: cell(row, tab.headerMap, "Status"),
        domainCreated: cell(row, tab.headerMap, "Domain Created"),
      }];
    });
    const rowsByKey = new Map<string, typeof sheetRows>();
    for (const row of sheetRows) rowsByKey.set(row.key, [...(rowsByKey.get(row.key) || []), row]);
    const jsonKeys = new Set(json.map((row) => row.key));
    const jsonWithStatus = json.map((record) => {
      const matches = rowsByKey.get(record.key) || [];
      return {
        ...record,
        status: matches.length === 0 ? "missing" : matches.length > 1 ? "duplicate" : "matched",
        sheetRows: matches,
      };
    });
    const unmatched = sheetRows.filter((row) => !jsonKeys.has(row.key));
    return NextResponse.json({
      ok: true,
      state,
      kind,
      sheetName,
      headers: tab.headers,
      summary: {
        jsonTotal: json.length,
        matched: jsonWithStatus.filter((row) => row.status === "matched").length,
        missing: jsonWithStatus.filter((row) => row.status === "missing").length,
        duplicateGroups: jsonWithStatus.filter((row) => row.status === "duplicate").length,
        duplicateRows: jsonWithStatus.reduce((sum, row) => sum + Math.max(0, row.sheetRows.length - 1), 0),
        unmatchedSheetRows: unmatched.length,
      },
      jsonRecords: jsonWithStatus,
      unmatchedSheetRows: unmatched,
    });
  } catch (error: any) {
    return NextResponse.json({ error: s(error?.message) || "Unable to compare Sheet and JSON" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tenantId = s(body.tenantId);
    const state = s(body.state);
    const kind = s(body.kind) as Kind;
    const county = s(body.county);
    const city = s(body.city);
    if (!tenantId || !state || !county || !["counties", "cities"].includes(kind) || (kind === "cities" && !city)) {
      return NextResponse.json({ error: "Invalid create request" }, { status: 400 });
    }
    const { config, sheetName, tab } = await context(tenantId, state, kind);
    const requestedKey = entityKey(kind, county, city);
    const alreadyExists = tab.rows.some((existingRow) =>
      cell(existingRow, tab.headerMap, "State").toLowerCase() === state.toLowerCase() &&
      entityKey(
        kind,
        cell(existingRow, tab.headerMap, "County"),
        kind === "cities" ? cell(existingRow, tab.headerMap, "City") : "",
      ) === requestedKey,
    );
    if (alreadyExists) {
      return NextResponse.json({ error: "This JSON record already exists in the Sheet. Refresh the comparison." }, { status: 409 });
    }
    const row = tab.headers.map((header) => {
      if (header === "State") return state;
      if (header === "County") return county;
      if (header === "City" && kind === "cities") return city;
      return "";
    });
    const sheets = await getTenantSheetsApi(tenantId);
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${sheetName}!A:ZZ`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    return NextResponse.json({ ok: true, updatedRange: result.data.updates?.updatedRange || "" });
  } catch (error: any) {
    return NextResponse.json({ error: s(error?.message) || "Unable to create Sheet row" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const tenantId = s(body.tenantId);
    const state = s(body.state);
    const kind = s(body.kind) as Kind;
    const rowNumber = Number(body.rowNumber);
    const county = s(body.county);
    const city = s(body.city);
    if (!tenantId || !state || !county || !Number.isInteger(rowNumber) || rowNumber < 2 || !["counties", "cities"].includes(kind) || (kind === "cities" && !city)) {
      return NextResponse.json({ error: "Invalid update request" }, { status: 400 });
    }
    const { config, sheetName, tab } = await context(tenantId, state, kind);
    const currentRow = tab.rows[rowNumber - 2];
    if (!currentRow || cell(currentRow, tab.headerMap, "State").toLowerCase() !== state.toLowerCase()) {
      return NextResponse.json({ error: `Row ${rowNumber} does not belong to ${state}` }, { status: 409 });
    }
    const sheets = await getTenantSheetsApi(tenantId);
    const updates = [
      { header: "State", value: state },
      { header: "County", value: county },
      ...(kind === "cities" ? [{ header: "City", value: city }] : []),
    ].map(({ header, value }) => {
      const index = tab.headerMap.get(header);
      if (index === undefined) throw new Error(`Missing header ${header} in ${sheetName}`);
      return { range: `${sheetName}!${columnLetter(index)}${rowNumber}`, values: [[value]] };
    });
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: updates },
    });
    return NextResponse.json({ ok: true, rowNumber });
  } catch (error: any) {
    return NextResponse.json({ error: s(error?.message) || "Unable to update Sheet row" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const tenantId = s(body.tenantId);
    const state = s(body.state);
    const kind = s(body.kind) as Kind;
    const rowNumber = Number(body.rowNumber);
    if (!tenantId || !state || !Number.isInteger(rowNumber) || rowNumber < 2 || !["counties", "cities"].includes(kind)) {
      return NextResponse.json({ error: "Invalid delete request" }, { status: 400 });
    }
    const { config, sheetName, tab } = await context(tenantId, state, kind);
    const currentRow = tab.rows[rowNumber - 2];
    if (!currentRow || cell(currentRow, tab.headerMap, "State").toLowerCase() !== state.toLowerCase()) {
      return NextResponse.json({ error: `Row ${rowNumber} does not belong to ${state}` }, { status: 409 });
    }
    const sheets = await getTenantSheetsApi(tenantId);
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: config.spreadsheetId, fields: "sheets.properties" });
    const sheet = metadata.data.sheets?.find((entry) => entry.properties?.title === sheetName);
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) throw new Error(`Unable to locate tab ${sheetName}`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber },
          },
        }],
      },
    });
    return NextResponse.json({ ok: true, rowNumber });
  } catch (error: any) {
    return NextResponse.json({ error: s(error?.message) || "Unable to delete Sheet row" }, { status: 500 });
  }
}
