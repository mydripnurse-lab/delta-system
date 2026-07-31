import { NextResponse } from "next/server";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";
import { getDbPool } from "@/lib/db";
import { listTenantStateFiles } from "@/lib/tenantStateCatalogDb";

export const runtime = "nodejs";

function norm(v: any) {
    return String(v ?? "").trim();
}
function isTrue(v: any) {
    const s = norm(v).toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y";
}
function nonEmpty(v: any) {
    return norm(v) !== "";
}

function normalizedCounty(v: unknown) {
    return norm(v)
        .toLowerCase()
        .replace(/\b(county|parish|borough|census area|municipality)\b/g, "")
        .replace(/[^a-z0-9]+/g, "");
}

function countiesFromPayload(payload: unknown) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
    const rows = (payload as Record<string, unknown>).counties;
    if (!Array.isArray(rows)) return [];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const obj = row as Record<string, unknown>;
        const name = norm(
            obj.countyName || obj.parishName || obj.boroughName || obj.municipalityName || obj.name,
        );
        const key = normalizedCounty(name);
        if (!name || !key || seen.has(key)) continue;
        seen.add(key);
        names.push(name);
    }
    return names;
}

function getCell(row: any[], headerMap: Map<string, number>, header: string) {
    const idx = headerMap.get(header);
    if (idx === undefined) return "";
    return row?.[idx] ?? "";
}

function ensureStateAgg(agg: any, state: string) {
    if (!agg[state]) {
        agg[state] = {
            state,
            counties: { total: 0, statusTrue: 0, hasLocId: 0, ready: 0, domainsActive: 0 },
            cities: { total: 0, statusTrue: 0, hasLocId: 0, ready: 0, domainsActive: 0 },
            jsonCounties: { total: 0, created: 0, missing: 0, missingNames: [] as string[] },
        };
    }
    return agg[state];
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = norm(searchParams.get("tenantId"));
        if (!tenantId) {
            return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
        }

        const cfg = await getTenantSheetConfig(tenantId);
        const debugEnv = {
            tenantId,
            GOOGLE_SHEET_ID: `${String(cfg.spreadsheetId).slice(0, 4)}***${String(cfg.spreadsheetId).slice(-4)}`,
            GOOGLE_SHEET_COUNTY_TAB: cfg.countyTab,
            GOOGLE_SHEET_CITY_TAB: cfg.cityTab,
            cwd: process.cwd(),
        };

        const [counties, cities, stateFiles] = await Promise.all([
            loadTenantSheetTabIndex({
                tenantId,
                spreadsheetId: cfg.spreadsheetId,
                sheetName: cfg.countyTab,
                range: "A:Z",
            }),
            loadTenantSheetTabIndex({
                tenantId,
                spreadsheetId: cfg.spreadsheetId,
                sheetName: cfg.cityTab,
                range: "A:Z",
            }),
            listTenantStateFiles(getDbPool(), tenantId),
        ]);

        const agg: Record<string, any> = {};
        const sheetCountyKeys = new Map<string, Set<string>>();

        for (const row of counties.rows || []) {
            const state = norm(getCell(row, counties.headerMap, "State"));
            if (!state) continue;

            const status = getCell(row, counties.headerMap, "Status");
            const locId = getCell(row, counties.headerMap, "Location Id");
            const domainCreated = getCell(row, counties.headerMap, "Domain Created");

            const s = ensureStateAgg(agg, state);
            const stateKey = state.toLowerCase();
            const countyName = norm(getCell(row, counties.headerMap, "County"));
            if (!sheetCountyKeys.has(stateKey)) sheetCountyKeys.set(stateKey, new Set());
            const countyKey = normalizedCounty(countyName);
            if (countyKey) sheetCountyKeys.get(stateKey)?.add(countyKey);
            s.counties.total += 1;
            if (isTrue(status)) s.counties.statusTrue += 1;
            if (nonEmpty(locId)) s.counties.hasLocId += 1;
            if (isTrue(status) && nonEmpty(locId)) s.counties.ready += 1;
            if (isTrue(domainCreated)) s.counties.domainsActive += 1;
        }

        for (const row of cities.rows || []) {
            const state = norm(getCell(row, cities.headerMap, "State"));
            if (!state) continue;

            const status = getCell(row, cities.headerMap, "Status");
            const locId = getCell(row, cities.headerMap, "Location Id");
            const domainCreated = getCell(row, cities.headerMap, "Domain Created");

            const s = ensureStateAgg(agg, state);
            s.cities.total += 1;
            if (isTrue(status)) s.cities.statusTrue += 1;
            if (nonEmpty(locId)) s.cities.hasLocId += 1;
            if (isTrue(status) && nonEmpty(locId)) s.cities.ready += 1;
            if (isTrue(domainCreated)) s.cities.domainsActive += 1;
        }

        for (const stateFile of stateFiles) {
            const stateName = norm(stateFile.state_name) || norm(stateFile.state_slug);
            if (!stateName) continue;
            const available = countiesFromPayload(stateFile.payload);
            const existing = sheetCountyKeys.get(stateName.toLowerCase()) || new Set<string>();
            const missingNames = available.filter((name) => !existing.has(normalizedCounty(name)));
            const stateAgg = ensureStateAgg(agg, stateName);
            stateAgg.jsonCounties = {
                total: available.length,
                created: available.length - missingNames.length,
                missing: missingNames.length,
                missingNames,
            };
        }

        const states = Object.values(agg).sort((a: any, b: any) =>
            String(a.state).localeCompare(String(b.state))
        );

        return NextResponse.json({
            tabs: { counties: cfg.countyTab, cities: cfg.cityTab },
            states,
            debugEnv,
        });
    } catch (err: any) {
        return NextResponse.json(
            {
                error: err?.message || "Unknown error",
                debug: {
                    cwd: process.cwd(),
                },
            },
            { status: 500 }
        );
    }
}
