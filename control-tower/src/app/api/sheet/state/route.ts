import { NextResponse } from "next/server";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";

export const runtime = "nodejs";

function s(v: any) {
    return String(v ?? "").trim();
}
function isTrue(v: any) {
    const t = s(v).toLowerCase();
    return t === "true" || t === "1" || t === "yes" || t === "y";
}
function nonEmpty(v: any) {
    return s(v) !== "";
}

function rowToObj(headers: string[], row: any[]) {
    const o: Record<string, any> = {};
    for (let i = 0; i < headers.length; i++) o[headers[i]] = row[i];
    return o;
}

function buildStatePayload(tab: any, stateName: string) {
    const idxState = tab.headerMap.get("State");
    const idxStatus = tab.headerMap.get("Status");
    const idxLocId = tab.headerMap.get("Location Id");

    if (idxState === undefined) throw new Error(`Missing header "State" in ${tab.sheetName}`);
    if (idxStatus === undefined) throw new Error(`Missing header "Status" in ${tab.sheetName}`);
    if (idxLocId === undefined) throw new Error(`Missing header "Location Id" in ${tab.sheetName}`);

    const wanted = stateName.toLowerCase();

    const rows: any[] = [];
    let stats = {
        total: 0,
        statusTrue: 0,
        hasLocId: 0,
        eligible: 0,
    };

    for (const r of tab.rows) {
        stats.total++;
        const state = s(r[idxState]).toLowerCase();
        if (!state || state !== wanted) continue;

        const statusOK = isTrue(r[idxStatus]);
        const locOK = nonEmpty(r[idxLocId]);

        if (statusOK) stats.statusTrue++;
        if (locOK) stats.hasLocId++;
        if (statusOK && locOK) stats.eligible++;

        const obj = rowToObj(tab.headers, r);
        obj.__eligible = statusOK && locOK;
        rows.push(obj);
    }

    const idxCounty = tab.headerMap.get("County");
    const counties = new Set<string>();
    if (idxCounty !== undefined) {
        for (const row of rows) {
            const c = s(row["County"]);
            if (c) counties.add(c);
        }
    }

    return {
        headers: tab.headers,
        rows,
        stats,
        counties: Array.from(counties).sort((a, b) => a.localeCompare(b)),
    };
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = s(searchParams.get("tenantId"));
        const state = s(searchParams.get("name"));
        if (!tenantId) return NextResponse.json({ error: "Missing query param '?tenantId=...'" }, { status: 400 });
        if (!state) return NextResponse.json({ error: 'Missing query param "?name=StateName"' }, { status: 400 });

        const cfg = await getTenantSheetConfig(tenantId);
        const [countiesTab, citiesTab] = await Promise.all([
            loadTenantSheetTabIndex({
                tenantId,
                spreadsheetId: cfg.spreadsheetId,
                sheetName: cfg.countyTab,
                range: "A:AZ",
            }),
            loadTenantSheetTabIndex({
                tenantId,
                spreadsheetId: cfg.spreadsheetId,
                sheetName: cfg.cityTab,
                range: "A:AZ",
            }),
        ]);

        const counties = buildStatePayload(countiesTab, state);
        const cities = buildStatePayload(citiesTab, state);

        return NextResponse.json({
            state,
            tabs: { counties: cfg.countyTab, cities: cfg.cityTab },
            counties,
            cities,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
    }
}
