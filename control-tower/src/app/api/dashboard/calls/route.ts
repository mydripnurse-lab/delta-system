import { NextResponse } from "next/server";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";
import { readDashboardKpiCache, writeDashboardKpiCache } from "@/lib/dashboardKpiCache";

export const runtime = "nodejs";

function s(v: unknown) {
    return String(v ?? "").trim();
}

function toRangeBoundaryMs(raw: string, boundary: "start" | "end") {
    const t = s(raw);
    if (!t) return null;
    const isDayOnly = /^\d{4}-\d{2}-\d{2}$/.test(t);
    if (isDayOnly) {
        const d = new Date(`${t}T00:00:00`);
        if (Number.isNaN(d.getTime())) return null;
        if (boundary === "end") d.setHours(23, 59, 59, 999);
        else d.setHours(0, 0, 0, 0);
        return d.getTime();
    }
    const d = new Date(t);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
}

// Google Sheets serial date -> JS Date (days since 1899-12-30)
function sheetSerialToDate(serial: number): Date {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + serial * 24 * 60 * 60 * 1000;
    return new Date(ms);
}

function parseDateLoose(v: unknown): Date | null {
    if (v === null || v === undefined || v === "") return null;

    if (typeof v === "number" && Number.isFinite(v)) {
        const d = sheetSerialToDate(v);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    const t = s(v);
    if (!t) return null;

    const d1 = new Date(t);
    if (!Number.isNaN(d1.getTime())) return d1;

    const m = t.match(
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i,
    );
    if (m) {
        const mm = Number(m[1]);
        const dd = Number(m[2]);
        let yy = Number(m[3]);
        if (yy < 100) yy += 2000;

        let hh = Number(m[4] ?? "0");
        const mi = Number(m[5] ?? "0");
        const ss = Number(m[6] ?? "0");
        const ap = (m[7] ?? "").toUpperCase();

        if (ap === "PM" && hh < 12) hh += 12;
        if (ap === "AM" && hh === 12) hh = 0;

        const d2 = new Date(yy, mm - 1, dd, hh, mi, ss);
        return Number.isNaN(d2.getTime()) ? null : d2;
    }

    return null;
}

function rowsToObjects(headers: string[], rows: unknown[][]) {
    return rows.map((arr) => {
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < headers.length; i++) {
            const key = headers[i] || `col_${i}`;
            obj[key] = arr?.[i] ?? "";
        }
        return obj;
    });
}

// ===== State normalization =====
const STATE_CODE_TO_NAME: Record<string, string> = {
    AL: "Alabama",
    AK: "Alaska",
    AZ: "Arizona",
    AR: "Arkansas",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DE: "Delaware",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    IA: "Iowa",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    ME: "Maine",
    MD: "Maryland",
    MA: "Massachusetts",
    MI: "Michigan",
    MN: "Minnesota",
    MS: "Mississippi",
    MO: "Missouri",
    MT: "Montana",
    NE: "Nebraska",
    NV: "Nevada",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NY: "New York",
    NC: "North Carolina",
    ND: "North Dakota",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VT: "Vermont",
    VA: "Virginia",
    WA: "Washington",
    WV: "West Virginia",
    WI: "Wisconsin",
    WY: "Wyoming",
    DC: "District of Columbia",
    PR: "Puerto Rico",
};

function normalizeState(raw: unknown) {
    const t = s(raw);
    if (!t) return "";

    const upper = t.toUpperCase();

    if (upper === "PR" || upper === "PUERTO RICO") return "Puerto Rico";
    if (upper.length === 2 && STATE_CODE_TO_NAME[upper]) return STATE_CODE_TO_NAME[upper];

    const wanted = t.toLowerCase();
    for (const name of Object.values(STATE_CODE_TO_NAME)) {
        if (name.toLowerCase() === wanted) return name;
    }

    return t;
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const start = s(url.searchParams.get("start"));
        const end = s(url.searchParams.get("end"));
        const tenantId = s(url.searchParams.get("tenantId"));
        const bust = s(url.searchParams.get("bust")) === "1";
        const preset = s(url.searchParams.get("preset"));
        const compareEnabled = s(url.searchParams.get("compare")) === "1";

        const startMs = start ? toRangeBoundaryMs(start, "start") : null;
        const endMs = end ? toRangeBoundaryMs(end, "end") : null;

        if (!tenantId) {
            return NextResponse.json(
                { ok: false, error: "Missing tenantId" },
                { status: 400 },
            );
        }

        if (!bust) {
            const cached = await readDashboardKpiCache({
                tenantId: tenantId,
                module: "calls",
                integrationKey: "sheet",
                start: start,
                end: end,
                preset,
                compare: compareEnabled,
            });
            if (cached?.payload) {
                return NextResponse.json({
                    ...(cached.payload as Record<string, unknown>),
                    cache: {
                        source: "db_range_cache",
                        cachedAt: cached.capturedAt || undefined,
                    },
                });
            }
        }

        const cfg = await getTenantSheetConfig(tenantId);

        // ✅ Tab correcto: "Call Report"
        const idx = await loadTenantSheetTabIndex({
            tenantId,
            spreadsheetId: cfg.spreadsheetId,
            sheetName: cfg.callReportTab,
            range: "A:ZZ",
        });

        const headers = (idx.headers || []).map((h: unknown) => String(h || "").trim());
        const rows = (idx.rows || []) as unknown[][];

        let objects = rowsToObjects(headers, rows).map((r: Record<string, unknown>) => {
            const d = parseDateLoose(r["Phone Call Start Time"]);
            return {
                ...r,
                __startIso: d ? d.toISOString() : "",
                __startMs: d ? d.getTime() : null,
                __fromStateNorm: normalizeState(r["Phone Call From State"]),
            };
        });

        if (startMs !== null && endMs !== null) {
            objects = objects.filter((r: Record<string, unknown>) => {
                if (!r.__startMs) return false;
                const rowMs = Number(r.__startMs);
                if (!Number.isFinite(rowMs)) return false;
                return rowMs >= startMs && rowMs <= endMs;
            });
        }

        const byState: Record<string, number> = {};
        for (const r of objects) {
            const st = s(r.__fromStateNorm);
            if (!st) continue;
            byState[st] = (byState[st] || 0) + 1;
        }

        const responsePayload = {
            ok: true,
            total: objects.length,
            byState,
            rows: objects,
            cache: { source: "sheet_refresh" },
        };

        await writeDashboardKpiCache({
            tenantId: tenantId,
            module: "calls",
            integrationKey: "sheet",
            start: start,
            end: end,
            preset,
            compare: compareEnabled,
            source: "sheet_calls_refresh",
            payload: responsePayload as Record<string, unknown>,
            ttlSec: Number(process.env.CALLS_RANGE_DB_CACHE_TTL_SEC || 180),
        });

        return NextResponse.json(responsePayload);
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "Failed to load Calls Dashboard" },
            { status: 500 },
        );
    }
}
