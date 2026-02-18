// control-tower/src/app/api/dashboard/gsc/sync/route.ts
import { NextResponse } from "next/server";
import {
    refreshGoogleAccessToken,
    resolveTenantOAuthConnection,
    saveTenantOAuthTokens,
} from "@/lib/tenantOAuth";
import { loadDashboardSnapshot, saveDashboardSnapshot } from "@/lib/dashboardSnapshots";

export const runtime = "nodejs";

type AnyObj = Record<string, any>;

function s(v: any) {
    return String(v ?? "").trim();
}
function num(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function daysAgoISO(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}

function monthsAgoISO(months: number) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
}

function toDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00Z");
    return Number.isFinite(d.getTime()) ? d : null;
}

function daysBetweenInclusive(startDate: string, endDate: string) {
    const a = toDate(startDate);
    const b = toDate(endDate);
    if (!a || !b) return 0;
    const diff = Math.round((b.getTime() - a.getTime()) / 864e5);
    return diff + 1;
}

function addDays(dateStr: string, delta: number) {
    const d = toDate(dateStr);
    if (!d) return dateStr;
    d.setUTCDate(d.getUTCDate() + delta);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
}

function parseRange(preset: string, start?: string, end?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const prevYear = now.getFullYear() - 1;
    const prevYearStart = `${prevYear}-01-01`;
    const prevYearEnd = `${prevYear}-12-31`;

    if (preset === "custom") {
        return {
            startDate: s(start) || daysAgoISO(28),
            endDate: s(end) || today,
            range: "custom",
        };
    }

    switch (preset) {
        case "last_7_days":
            return { startDate: daysAgoISO(7), endDate: today, range: "last_7_days" };
        case "last_28_days":
            return { startDate: daysAgoISO(28), endDate: today, range: "last_28_days" };
        case "last_month":
            return { startDate: monthsAgoISO(1), endDate: today, range: "last_month" };
        case "last_quarter":
            return { startDate: monthsAgoISO(3), endDate: today, range: "last_quarter" };
        case "last_6_months":
            return { startDate: monthsAgoISO(6), endDate: today, range: "last_6_months" };
        case "last_year":
            return { startDate: prevYearStart, endDate: prevYearEnd, range: "last_year" };
        default:
            return { startDate: daysAgoISO(28), endDate: today, range: "last_28_days" };
    }
}

/**
 * Lee tu token JSON (OAuth tokens).
 */
async function loadTokens(tenantId: string, integrationKey: string) {
    if (!tenantId) throw new Error("Missing tenantId for GSC sync.");
    const conn = await resolveTenantOAuthConnection({
        tenantId,
        provider: "google_search_console",
        integrationKey,
    });
    const cfg = (conn.config || {}) as Record<string, unknown>;
    const siteUrl =
        s(conn.externalPropertyId) ||
        s(cfg.siteUrl) ||
        s(cfg.gscSiteUrl);
    if (!siteUrl) {
        throw new Error(
            "Missing GSC property for tenant integration. Set externalPropertyId or config.siteUrl.",
        );
    }

    return {
        siteUrl,
        access_token: conn.accessToken,
        refresh_token: conn.refreshToken,
        expiry_date: conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0,
        oauthClientId: conn.client.clientId,
        oauthClientSecret: conn.client.clientSecret,
    };
}

/**
 * Refresca access token usando refresh_token (OAuth).
 */
async function refreshAccessToken(refreshToken: string, oauthClientId?: string, oauthClientSecret?: string) {
    if (!oauthClientId || !oauthClientSecret) {
        throw new Error("Missing OAuth client config in tenant integration.");
    }
    const refreshed = await refreshGoogleAccessToken({
        clientId: oauthClientId,
        clientSecret: oauthClientSecret,
        refreshToken,
    });

    return {
        access_token: refreshed.accessToken,
        refresh_token: refreshed.refreshToken,
        expires_in: refreshed.expiresIn,
        scope: refreshed.scope,
    };
}

async function gscQueryAll(params: {
    siteUrl: string;
    accessToken: string;
    startDate: string;
    endDate: string;
    dimensions: string[];
    rowLimit?: number;
}) {
    const rowLimit = params.rowLimit ?? 25000;

    const allRows: AnyObj[] = [];
    let startRow = 0;

    while (true) {
        const payload: AnyObj = {
            startDate: params.startDate,
            endDate: params.endDate,
            dimensions: params.dimensions,
            rowLimit,
            startRow,
            dataState: "final",
        };

        const url =
            "https://www.googleapis.com/webmasters/v3/sites/" +
            encodeURIComponent(params.siteUrl) +
            "/searchAnalytics/query";

        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${params.accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || `GSC HTTP ${res.status}`);

        const rows = Array.isArray(json?.rows) ? json.rows : [];
        allRows.push(...rows);

        if (rows.length < rowLimit) break;

        startRow += rowLimit;
        if (startRow > 500000) break;
    }

    return allRows;
}

function isStale(meta: any, staleMinutes: number) {
    const fetchedAt = meta?.fetchedAt ? new Date(meta.fetchedAt).getTime() : 0;
    if (!fetchedAt) return true;
    const ageMs = Date.now() - fetchedAt;
    return ageMs > staleMinutes * 60 * 1000;
}

export async function GET(req: Request) {
    try {
        const u = new URL(req.url);
        const preset = s(u.searchParams.get("range") || "last_28_days");
        const start = s(u.searchParams.get("start"));
        const end = s(u.searchParams.get("end"));
        const force = s(u.searchParams.get("force")) === "1";
        const tenantId = s(u.searchParams.get("tenantId"));
        const integrationKey = s(u.searchParams.get("integrationKey")) || "default";
        if (!tenantId) {
            return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
        }

        // ✅ compare=1 => trend trae también la ventana previa (para %)
        const compare = s(u.searchParams.get("compare")) === "1";

        const { startDate, endDate, range } = parseRange(preset, start, end);

        const snap = await loadDashboardSnapshot(tenantId, "gsc");
        const snapPayload = (snap?.payload || {}) as AnyObj;
        const metaPrev = (snapPayload.meta || null) as AnyObj | null;
        const stale = isStale(metaPrev, 10);

        const wantTrendCompare = compare ? true : false;

        if (
            !force &&
            !stale &&
            metaPrev?.range === range &&
            metaPrev?.startDate === startDate &&
            metaPrev?.endDate === endDate &&
            !!metaPrev?.trendIncludesCompare === wantTrendCompare &&
            // ✅ if we already had qp included, keep cache
            !!metaPrev?.qpIncluded === true
        ) {
            return NextResponse.json({
                ok: true,
                meta: metaPrev,
                cache: { refreshed: false, reason: "fresh" },
            });
        }

        const tok = await loadTokens(tenantId, integrationKey);

        const refreshed = await refreshAccessToken(
            tok.refresh_token,
            tok.oauthClientId,
            tok.oauthClientSecret,
        );
        const access_token = s(refreshed.access_token);
        if (!access_token) throw new Error("Could not refresh access token");
        if (tenantId) {
            await saveTenantOAuthTokens({
                tenantId,
                provider: "google_search_console",
                integrationKey,
                accessToken: access_token,
                refreshToken: s(refreshed.refresh_token),
                scopes: s(refreshed.scope).split(" ").map((x) => s(x)).filter(Boolean),
                tokenExpiresAt:
                    Number.isFinite(Number(refreshed.expires_in)) && Number(refreshed.expires_in) > 0
                        ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
                        : null,
                markConnected: true,
            });
        }

        // 1) pages (page)
        const pagesRows = await gscQueryAll({
            siteUrl: tok.siteUrl,
            accessToken: access_token,
            startDate,
            endDate,
            dimensions: ["page"],
            rowLimit: 25000,
        });

        // 2) queries (query)
        const queriesRows = await gscQueryAll({
            siteUrl: tok.siteUrl,
            accessToken: access_token,
            startDate,
            endDate,
            dimensions: ["query"],
            rowLimit: 25000,
        });

        // 3) ✅ query + page (para keywords por estado)
        const queryPageRows = await gscQueryAll({
            siteUrl: tok.siteUrl,
            accessToken: access_token,
            startDate,
            endDate,
            dimensions: ["query", "page"],
            rowLimit: 25000,
        });

        // trend por date (si compare=1, incluye ventana previa)
        const windowDays = daysBetweenInclusive(startDate, endDate);
        const trendStart = compare && windowDays > 0 ? addDays(startDate, -windowDays) : startDate;

        const trendRows = await gscQueryAll({
            siteUrl: tok.siteUrl,
            accessToken: access_token,
            startDate: trendStart,
            endDate,
            dimensions: ["date"],
            rowLimit: 25000,
        });

        const fetchedAt = new Date().toISOString();
        const meta = {
            ok: true,
            siteUrl: tok.siteUrl,
            range,
            startDate,
            endDate,
            fetchedAt,
            error: null,
            trendStart,
            trendIncludesCompare: wantTrendCompare,

            // ✅ IMPORTANT: join expects qp.json; we guarantee it's present
            qpIncluded: true,
        };

        await saveDashboardSnapshot(
            tenantId,
            "gsc",
            {
                meta,
                pages: { rows: pagesRows },
                queries: { rows: queriesRows },
                qp: { rows: queryPageRows },
                trend: { rows: trendRows },
            },
            { source: "dashboard_gsc_sync" },
        );

        return NextResponse.json({
            ok: true,
            meta,
            counts: {
                pages: pagesRows.length,
                queries: queriesRows.length,
                qp: queryPageRows.length,
                trend: trendRows.length,
            },
            cache: { refreshed: true },
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "GSC sync failed" }, { status: 500 });
    }
}
