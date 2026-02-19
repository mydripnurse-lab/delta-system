import { NextResponse } from "next/server";
import { googleAdsSearch } from "@/lib/ads/adsRest";
import { readCache, writeCache, cacheFresh } from "@/lib/ads/adsCache";
import { qKpis, qTrendDaily, qCampaigns, qSearchTerms, qTopKeywords } from "@/lib/ads/adsQueries";

export const runtime = "nodejs";

function s(v: unknown) {
    return String(v ?? "").trim();
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}
function addDays(dateIso: string, days: number) {
    const d = new Date(dateIso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function toMs(dateIso: string) {
    return new Date(`${dateIso}T00:00:00Z`).getTime();
}

function toIsoDate(ms: number) {
    return new Date(ms).toISOString().slice(0, 10);
}

function prevPeriodRange(start: string, end: string) {
    const startMs = toMs(start);
    const endMs = toMs(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
        return { start, end };
    }
    const days = Math.floor((endMs - startMs) / 86_400_000) + 1;
    const prevEndMs = startMs - 86_400_000;
    const prevStartMs = prevEndMs - (days - 1) * 86_400_000;
    return { start: toIsoDate(prevStartMs), end: toIsoDate(prevEndMs) };
}

function resolveRange(range: string, startQ?: string, endQ?: string) {
    const end = todayISO();
    const now = new Date();
    const prevYear = now.getFullYear() - 1;
    const prevYearStart = `${prevYear}-01-01`;
    const prevYearEnd = `${prevYear}-12-31`;
    const startCustom = s(startQ);
    const endCustom = s(endQ);
    if (range === "custom" && startCustom && endCustom) {
        return { start: startCustom, end: endCustom };
    }
    if (range === "last_7_days") return { start: addDays(end, -6), end };
    if (range === "last_28_days") return { start: addDays(end, -27), end };
    if (range === "last_month") return { start: addDays(end, -30), end };
    if (range === "last_quarter") return { start: addDays(end, -90), end };
    if (range === "last_6_months") return { start: addDays(end, -180), end };
    if (range === "last_year") return { start: prevYearStart, end: prevYearEnd };
    return { start: addDays(end, -27), end };
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const range = s(url.searchParams.get("range")) || "last_28_days";
        const force = s(url.searchParams.get("force")) === "1";
        const tenantId = s(url.searchParams.get("tenantId"));
        const integrationKey = s(url.searchParams.get("integrationKey")) || "default";
        const startQ = s(url.searchParams.get("start"));
        const endQ = s(url.searchParams.get("end"));
        if (!tenantId) {
            return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
        }

        const ttl = Number(process.env.ADS_CACHE_TTL_SECONDS || 600);

        const { start, end } = resolveRange(range, startQ, endQ);
        const prev = prevPeriodRange(start, end);

        const cacheKey = `ads_${tenantId}_${integrationKey}_${range}`;
        const cached = await readCache(cacheKey);

        if (!force && cached && cacheFresh(cached, ttl)) {
            return NextResponse.json({ ok: true, cached: true, key: cacheKey, meta: cached.meta });
        }

        const generatedAt = new Date().toISOString();
        const meta = { range, startDate: start, endDate: end, generatedAt };
        const prevMeta = { range: `${range}_prev`, startDate: prev.start, endDate: prev.end, generatedAt };

        const safeAdsSearch = async (query: string, label: string) => {
            try {
                return await googleAdsSearch({
                    query,
                    version: "v17",
                    tenantId,
                    integrationKey,
                });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                return {
                    results: [],
                    _error: `${label} query failed: ${msg}`,
                };
            }
        };

        // KPIs (customer)
        const kpis = await googleAdsSearch({
            query: qKpis(start, end),
            version: "v17",
            tenantId,
            integrationKey,
        });
        const prevKpis = await googleAdsSearch({
            query: qKpis(prev.start, prev.end),
            version: "v17",
            tenantId,
            integrationKey,
        });

        // Trend daily
        const trend = await googleAdsSearch({
            query: qTrendDaily(start, end),
            version: "v17",
            tenantId,
            integrationKey,
        });

        // Campaigns top
        const campaigns = await googleAdsSearch({
            query: qCampaigns(start, end),
            version: "v17",
            tenantId,
            integrationKey,
        });

        const topKeywords = await safeAdsSearch(qTopKeywords(start, end), "topKeywords");
        const searchTerms = await safeAdsSearch(qSearchTerms(start, end), "searchTerms");

        const warnings = [topKeywords?._error, searchTerms?._error].filter(Boolean);

        const envelope = {
            meta,
            prevMeta,
            kpis,
            prevKpis,
            trend,
            campaigns,
            topKeywords,
            searchTerms,
            generatedAt,
            warnings,
        };

        const savedPath = await writeCache(cacheKey, envelope);

        return NextResponse.json({ ok: true, cached: false, key: cacheKey, savedPath, meta });
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}
