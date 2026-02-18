// control-tower/src/app/api/dashboard/ga/sync/route.ts
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

function normalizeGaPropertyId(v: unknown): string {
    const raw = s(v);
    if (!raw) return "";
    // Accept both "123456789" and "properties/123456789"
    const match = raw.match(/(?:^|\/)(\d{5,})$/);
    return match ? match[1] : "";
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

function isStale(meta: any, staleMinutes: number) {
    const fetchedAt = meta?.fetchedAt ? new Date(meta.fetchedAt).getTime() : 0;
    if (!fetchedAt) return true;
    const ageMs = Date.now() - fetchedAt;
    return ageMs > staleMinutes * 60 * 1000;
}

async function loadRefreshToken(tenantId: string, integrationKey: string) {
    if (!tenantId) throw new Error("Missing tenantId for GA sync.");
    try {
        const gaConn = await resolveTenantOAuthConnection({
            tenantId,
            provider: "google_analytics",
            integrationKey,
        });
        return {
            refresh_token: gaConn.refreshToken,
            scopes: gaConn.scopes.join(" "),
            oauthClientId: gaConn.client.clientId,
            oauthClientSecret: gaConn.client.clientSecret,
            externalPropertyId: gaConn.externalPropertyId,
            config: gaConn.config,
            providerUsed: "google_analytics",
        };
    } catch {
        const gscConn = await resolveTenantOAuthConnection({
            tenantId,
            provider: "google_search_console",
            integrationKey,
        });
        return {
            refresh_token: gscConn.refreshToken,
            scopes: gscConn.scopes.join(" "),
            oauthClientId: gscConn.client.clientId,
            oauthClientSecret: gscConn.client.clientSecret,
            externalPropertyId: gscConn.externalPropertyId,
            config: gscConn.config,
            providerUsed: "google_search_console",
        };
    }
}

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

async function gaRunReport(params: {
    propertyId: string;
    accessToken: string;
    startDate: string;
    endDate: string;
    dimensions: string[];
    metrics: string[];
    limit?: number;
    orderBys?: AnyObj[];
}) {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(
        params.propertyId,
    )}:runReport`;

    const payload: AnyObj = {
        dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
        dimensions: params.dimensions.map((name) => ({ name })),
        metrics: params.metrics.map((name) => ({ name })),
        limit: params.limit ?? 25000,
    };

    if (Array.isArray(params.orderBys) && params.orderBys.length) {
        payload.orderBys = params.orderBys;
    }

    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${params.accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
        throw new Error(json?.error?.message || `GA4 HTTP ${res.status}`);
    }

    return json;
}

export async function GET(req: Request) {
    try {
        const u = new URL(req.url);
        const preset = s(u.searchParams.get("range") || "last_28_days");
        const start = s(u.searchParams.get("start"));
        const end = s(u.searchParams.get("end"));
        const force = s(u.searchParams.get("force")) === "1";
        const compare = s(u.searchParams.get("compare")) === "1";
        const tenantId = s(u.searchParams.get("tenantId"));
        const integrationKey = s(u.searchParams.get("integrationKey")) || "default";
        if (!tenantId) {
            return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
        }

        const tok = await loadRefreshToken(tenantId, integrationKey);
        const cfg = (tok.config || {}) as Record<string, unknown>;
        const propertyId =
            normalizeGaPropertyId(u.searchParams.get("propertyId")) ||
            normalizeGaPropertyId(cfg.ga4PropertyId) ||
            normalizeGaPropertyId(cfg.ga4_property_id) ||
            normalizeGaPropertyId(cfg.ga_property_id) ||
            normalizeGaPropertyId(tok.externalPropertyId) ||
            normalizeGaPropertyId(cfg.propertyId);
        if (!propertyId) {
            throw new Error(
                "Missing/invalid GA4 property ID in tenant integration config. Set 'GA4 Property ID' with a numeric value.",
            );
        }

        const { startDate, endDate, range } = parseRange(preset, start, end);

        const snap = await loadDashboardSnapshot(tenantId, "ga");
        const snapPayload = (snap?.payload || {}) as AnyObj;
        const metaPrev = (snapPayload.meta || null) as AnyObj | null;
        const stale = isStale(metaPrev, 10);

        const windowDays = daysBetweenInclusive(startDate, endDate);
        const trendStart = compare && windowDays > 0 ? addDays(startDate, -windowDays) : startDate;

        if (
            !force &&
            !stale &&
            metaPrev?.range === range &&
            metaPrev?.startDate === startDate &&
            metaPrev?.endDate === endDate &&
            !!metaPrev?.trendIncludesCompare === !!compare
        ) {
            return NextResponse.json({ ok: true, meta: metaPrev, cache: { refreshed: false, reason: "fresh" } });
        }

        const { refresh_token, scopes } = tok;

        // sanity: if GA scope missing, you’ll get 403 later – make it obvious
        if (!scopes.includes("analytics")) {
            // still proceed, but warn in meta
        }

        const refreshed = await refreshAccessToken(
            refresh_token,
            tok.oauthClientId,
            tok.oauthClientSecret,
        );
        const access_token = s(refreshed.access_token);
        if (!access_token) throw new Error("Could not refresh access token");
        if (tenantId) {
            await saveTenantOAuthTokens({
                tenantId,
                provider: tok.providerUsed === "google_analytics" ? "google_analytics" : "google_search_console",
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

        // 1) Trend (date)
        const trend = await gaRunReport({
            propertyId,
            accessToken: access_token,
            startDate: trendStart,
            endDate,
            dimensions: ["date"],
            metrics: ["sessions", "activeUsers", "screenPageViews", "engagementRate", "conversions"],
            limit: 25000,
        });

        // 2) By state/region
        const byRegion = await gaRunReport({
            propertyId,
            accessToken: access_token,
            startDate,
            endDate,
            dimensions: ["country", "region"],
            metrics: ["sessions", "activeUsers", "screenPageViews", "engagementRate", "conversions"],
            limit: 25000,
            orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        });

        // 3) By city
        const byCity = await gaRunReport({
            propertyId,
            accessToken: access_token,
            startDate,
            endDate,
            dimensions: ["country", "region", "city"],
            metrics: ["sessions", "activeUsers", "screenPageViews", "engagementRate", "conversions"],
            limit: 25000,
            orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        });

        // 4) Landing pages
        const landing = await gaRunReport({
            propertyId,
            accessToken: access_token,
            startDate,
            endDate,
            dimensions: ["landingPagePlusQueryString"],
            metrics: ["sessions", "activeUsers", "screenPageViews", "engagementRate", "conversions"],
            limit: 25000,
            orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        });

        // 5) Source / Medium
        const sourceMedium = await gaRunReport({
            propertyId,
            accessToken: access_token,
            startDate,
            endDate,
            dimensions: ["sessionSource", "sessionMedium"],
            metrics: ["sessions", "activeUsers", "screenPageViews", "engagementRate", "conversions"],
            limit: 25000,
            orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        });

        const fetchedAt = new Date().toISOString();
        const meta = {
            ok: true,
            propertyId,
            range,
            startDate,
            endDate,
            fetchedAt,
            trendStart,
            trendIncludesCompare: !!compare,
            warning: scopes.includes("analytics")
                ? null
                : "Refresh token scope does NOT include analytics.readonly. Re-run /api/auth/gsc/start and consent again.",
        };

        await saveDashboardSnapshot(
            tenantId,
            "ga",
            {
                meta,
                trend,
                by_region: byRegion,
                by_city: byCity,
                landing,
                source_medium: sourceMedium,
            },
            { source: "dashboard_ga_sync" },
        );

        return NextResponse.json({
            ok: true,
            meta,
            counts: {
                trend: trend?.rows?.length || 0,
                byRegion: byRegion?.rows?.length || 0,
                byCity: byCity?.rows?.length || 0,
                landing: landing?.rows?.length || 0,
                sourceMedium: sourceMedium?.rows?.length || 0,
            },
            cache: { refreshed: true },
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "GA sync failed" }, { status: 500 });
    }
}
