import { NextResponse } from "next/server";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";

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

        const counties = await loadTenantSheetTabIndex({
            tenantId,
            spreadsheetId: cfg.spreadsheetId,
            sheetName: cfg.countyTab,
            range: "A:Z",
        });

        const cities = await loadTenantSheetTabIndex({
            tenantId,
            spreadsheetId: cfg.spreadsheetId,
            sheetName: cfg.cityTab,
            range: "A:Z",
        });

        const agg: Record<string, any> = {};

        for (const row of counties.rows || []) {
            const state = norm(getCell(row, counties.headerMap, "State"));
            if (!state) continue;

            const status = getCell(row, counties.headerMap, "Status");
            const locId = getCell(row, counties.headerMap, "Location Id");
            const domainCreated = getCell(row, counties.headerMap, "Domain Created");

            const s = ensureStateAgg(agg, state);
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
