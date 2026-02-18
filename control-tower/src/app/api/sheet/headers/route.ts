// src/app/api/sheet/headers/route.ts
import { NextResponse } from "next/server";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";

export const runtime = "nodejs";

function s(v: any) {
    return String(v ?? "").trim();
}

function maskId(id: string) {
    const x = s(id);
    if (x.length <= 8) return "***";
    return `${x.slice(0, 4)}…${x.slice(-4)}`;
}

function pickHeader(headers: string[], candidates: string[], envOverride?: string) {
    const normalized = headers.map((h) => s(h));
    const set = new Set(normalized);

    const override = s(envOverride);
    if (override && set.has(override)) return override;

    for (const c of candidates) {
        if (set.has(c)) return c;
    }
    return "";
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const locId = s(url.searchParams.get("locId")); // opcional ahora
    const tenantId = s(url.searchParams.get("tenantId"));

    if (!tenantId) {
        return NextResponse.json(
            {
                error: "Missing tenantId",
            },
            { status: 400 }
        );
    }

    try {
        const cfg = await getTenantSheetConfig(tenantId);
        const idx = await loadTenantSheetTabIndex({
            tenantId,
            spreadsheetId: cfg.spreadsheetId,
            sheetName: cfg.headersTab,
            range: cfg.headersRange,
        });

        const headers: string[] = Array.isArray(idx?.headers) ? idx.headers : [];
        const rows: any[][] = Array.isArray(idx?.rows) ? idx.rows : [];
        const headerMap: Map<string, number> = idx?.headerMap || new Map();

        // detect columns
        const COL_LOCID = pickHeader(
            headers,
            ["Location Id", "LocationID", "location id", "locationId", "Loc Id", "locId", "Location"],
            process.env.HEADERS_COL_LOCATION_ID
        );

        const COL_HEAD = pickHeader(
            headers,
            ["Head", "HEAD", "Head HTML", "Global Head"],
            process.env.HEADERS_COL_HEAD
        );

        const COL_FOOTER = pickHeader(
            headers,
            ["Footer", "FOOTER", "Footer HTML", "Global Footer"],
            process.env.HEADERS_COL_FOOTER
        );

        const COL_FAVICON = pickHeader(
            headers,
            ["Favicon", "FAVICON", "Favicon URL", "Favicon Link", "Icon", "Icon URL"],
            process.env.HEADERS_COL_FAVICON
        );

        const headCol = COL_HEAD ? headerMap.get(COL_HEAD) : undefined;
        const footerCol = COL_FOOTER ? headerMap.get(COL_FOOTER) : undefined;
        const faviconCol = COL_FAVICON ? headerMap.get(COL_FAVICON) : undefined;

        // --- MODE A: per-location (si existe Location Id) ---
        if (COL_LOCID) {
            const locCol = headerMap.get(COL_LOCID);

            if (locCol === undefined) {
                return NextResponse.json(
                    {
                        error: "Headers tab: Location Id column exists but headerMap didn’t map it.",
                        debug: {
                            spreadsheetId: maskId(cfg.spreadsheetId),
                            sheetName: cfg.headersTab,
                            range: cfg.headersRange,
                            COL_LOCID,
                            headerMapKeys: Array.from(headerMap.keys()),
                        },
                    },
                    { status: 500 }
                );
            }

            if (!locId) {
                return NextResponse.json(
                    {
                        error: "Missing locId (Headers tab is per-location because it has Location Id column).",
                        debug: { sheetName: cfg.headersTab, spreadsheetId: maskId(cfg.spreadsheetId) },
                    },
                    { status: 400 }
                );
            }

            let foundIndex = -1;
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i] || [];
                if (s(r[locCol]) === locId) {
                    foundIndex = i;
                    break;
                }
            }

            if (foundIndex < 0) {
                return NextResponse.json(
                    {
                        head: "",
                        footer: "",
                        favicon: "",
                        source: { mode: "per-location", match: "none", key: locId },
                    },
                    { status: 200 }
                );
            }

            const r = rows[foundIndex] || [];

            return NextResponse.json(
                {
                    head: headCol === undefined ? "" : s(r[headCol]),
                    footer: footerCol === undefined ? "" : s(r[footerCol]),
                    favicon: faviconCol === undefined ? "" : s(r[faviconCol]),
                    source: { mode: "per-location", key: locId, row: foundIndex + 2 },
                    cols: {
                        locationId: COL_LOCID,
                        head: COL_HEAD || "",
                        footer: COL_FOOTER || "",
                        favicon: COL_FAVICON || "",
                    },
                },
                { status: 200 }
            );
        }

        // --- MODE B: global (tu caso: NO existe Location Id) ---
        // Tomamos la primera fila de data (row 2 del sheet) como "global config"
        const first = rows[0] || [];

        return NextResponse.json(
            {
                head: headCol === undefined ? "" : s(first[headCol]),
                footer: footerCol === undefined ? "" : s(first[footerCol]),
                favicon: faviconCol === undefined ? "" : s(first[faviconCol]),
                source: { mode: "global", row: rows.length ? 2 : null },
                cols: {
                    head: COL_HEAD || "",
                    footer: COL_FOOTER || "",
                    favicon: COL_FAVICON || "",
                },
                debug: {
                    note:
                        "Global headers mode: tab has no Location Id column. Using first data row as global config.",
                    sheetName: cfg.headersTab,
                    spreadsheetId: maskId(cfg.spreadsheetId),
                },
            },
            { status: 200 }
        );
    } catch (e: any) {
        return NextResponse.json(
            {
                error: e?.message || "Failed to read Headers tab",
                debug: {
                    tenantId,
                    locId,
                    stack: process.env.NODE_ENV !== "production" ? String(e?.stack || "") : undefined,
                },
            },
            { status: 500 }
        );
    }
}
