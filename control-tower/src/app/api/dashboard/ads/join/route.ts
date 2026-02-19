import { NextResponse } from "next/server";
import { readCache } from "@/lib/ads/adsCache";
import { joinAds } from "@/lib/ads/adsJoin";

export const runtime = "nodejs";

function pickResults(raw: unknown) {
    const src = raw as { results?: unknown[] } | null;
    return Array.isArray(src?.results) ? src.results : [];
}
function num(v: unknown) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
function s(v: unknown) {
    return String(v ?? "").trim();
}
function microsToMoney(m: unknown) {
    return num(m) / 1_000_000;
}
function pct(cur: number, prev: number) {
    if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
    if (prev <= 0) return cur === 0 ? 0 : null;
    return (cur - prev) / prev;
}
function avg(...vals: number[]) {
    const ok = vals.filter((x) => Number.isFinite(x));
    if (!ok.length) return 0;
    return ok.reduce((a, b) => a + b, 0) / ok.length;
}
function median(list: number[]) {
    const xs = list.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!xs.length) return 0;
    const mid = Math.floor(xs.length / 2);
    if (xs.length % 2) return xs[mid] || 0;
    return avg(xs[mid - 1] || 0, xs[mid] || 0);
}
function includesAny(haystack: string, terms: string[]) {
    const text = s(haystack).toLowerCase();
    return terms.some((t) => text.includes(t));
}

type AdsMetricPayload = {
    metrics?: {
        impressions?: unknown;
        clicks?: unknown;
        ctr?: unknown;
        averageCpc?: unknown;
        costMicros?: unknown;
        conversions?: unknown;
        conversionsValue?: unknown;
    };
    segments?: { date?: unknown };
    campaign?: {
        id?: unknown;
        name?: unknown;
        status?: unknown;
        advertisingChannelType?: unknown;
    };
    adGroup?: {
        id?: unknown;
        name?: unknown;
    };
    adGroupCriterion?: {
        criterionId?: unknown;
        keyword?: {
            text?: unknown;
            matchType?: unknown;
        };
    };
    searchTermView?: {
        searchTerm?: unknown;
    };
};

type AdsSummaryPayload = {
    startDate?: unknown;
    endDate?: unknown;
    impressions?: unknown;
    clicks?: unknown;
    cost?: unknown;
    conversions?: unknown;
    avgCpc?: unknown;
    ctr?: unknown;
    roas?: unknown;
    conversionValue?: unknown;
};

function asPayload(r: unknown): AdsMetricPayload {
    return (r || {}) as AdsMetricPayload;
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const range = s(url.searchParams.get("range")) || "last_28_days";
        const tenantId = s(url.searchParams.get("tenantId"));
        const integrationKey = s(url.searchParams.get("integrationKey")) || "default";

        if (!tenantId) {
            return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
        }

        const key = `ads_${tenantId}_${integrationKey}_${range}`;
        const cached = await readCache(key);
        if (!cached) {
            return NextResponse.json(
                { ok: false, error: `No cache for ${key}. Run /api/dashboard/ads/sync first.` },
                { status: 404 },
            );
        }

        const meta = cached.meta || null;

        const summary = joinAds(cached.kpis, meta);
        const summaryPrev = joinAds(cached.prevKpis, cached.prevMeta || null);

        const trendRows = pickResults(cached.trend).map((r: unknown) => {
            const row = asPayload(r);
            const m = row.metrics || {};
            return {
                date: s(row.segments?.date),
                impressions: num(m.impressions),
                clicks: num(m.clicks),
                ctr: num(m.ctr),
                avgCpc: microsToMoney(m.averageCpc),
                cost: microsToMoney(m.costMicros),
                conversions: num(m.conversions),
                conversionValue: num(m.conversionsValue),
            };
        });

        const campaignRows = pickResults(cached.campaigns).map((r: unknown) => {
            const row = asPayload(r);
            const c = row.campaign || {};
            const m = row.metrics || {};
            const cost = microsToMoney(m.costMicros);
            const clicks = num(m.clicks);
            const conversions = num(m.conversions);
            const conversionValue = num(m.conversionsValue);
            const cpa = conversions > 0 ? cost / conversions : cost;
            const roas = cost > 0 ? conversionValue / cost : 0;
            return {
                id: s(c.id),
                campaign: s(c.name),
                name: s(c.name),
                status: s(c.status),
                channel: s(c.advertisingChannelType),
                impressions: num(m.impressions),
                clicks,
                ctr: num(m.ctr),
                avgCpc: microsToMoney(m.averageCpc),
                cost,
                conversions,
                conversionValue,
                cpa,
                roas,
            };
        });

        const keywordRows = pickResults(cached.topKeywords).map((r: unknown) => {
            const row = asPayload(r);
            const m = row.metrics || {};
            const cost = microsToMoney(m.costMicros);
            const clicks = num(m.clicks);
            const conversions = num(m.conversions);
            return {
                campaign: s(row.campaign?.name),
                adGroup: s(row.adGroup?.name),
                keyword: s(row.adGroupCriterion?.keyword?.text),
                matchType: s(row.adGroupCriterion?.keyword?.matchType),
                impressions: num(m.impressions),
                clicks,
                ctr: num(m.ctr),
                avgCpc: microsToMoney(m.averageCpc),
                cost,
                conversions,
                conversionValue: num(m.conversionsValue),
                cpa: conversions > 0 ? cost / conversions : cost,
            };
        }).filter((r) => r.keyword);

        const searchTermRows = pickResults(cached.searchTerms).map((r: unknown) => {
            const row = asPayload(r);
            const m = row.metrics || {};
            const cost = microsToMoney(m.costMicros);
            const clicks = num(m.clicks);
            const conversions = num(m.conversions);
            return {
                campaign: s(row.campaign?.name),
                adGroup: s(row.adGroup?.name),
                term: s(row.searchTermView?.searchTerm),
                impressions: num(m.impressions),
                clicks,
                ctr: num(m.ctr),
                avgCpc: microsToMoney(m.averageCpc),
                cost,
                conversions,
                conversionValue: num(m.conversionsValue),
                cpa: conversions > 0 ? cost / conversions : cost,
            };
        }).filter((r) => r.term);

        const costSeries = campaignRows.map((x) => num(x.cost));
        const cpaSeries = campaignRows.map((x) => num(x.cpa));
        const ctrSeries = campaignRows.map((x) => num(x.ctr));
        const medianCost = median(costSeries);
        const medianCpa = median(cpaSeries);
        const medianCtr = median(ctrSeries);

        const winners = campaignRows
            .filter((r) => r.conversions > 0 && r.cpa <= Math.max(1, medianCpa * 1.2) && r.roas >= 1)
            .sort((a, b) => b.roas - a.roas || b.conversions - a.conversions)
            .slice(0, 15);

        const losers = campaignRows
            .filter((r) => r.cost >= Math.max(10, medianCost) && (r.conversions <= 0 || r.cpa > Math.max(1, medianCpa * 1.6)))
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 15);

        const kwLeaks = keywordRows
            .filter((r) => r.clicks >= 12 && r.conversions <= 0 && r.cost >= Math.max(6, medianCost * 0.06))
            .sort((a, b) => b.cost - a.cost || b.clicks - a.clicks)
            .slice(0, 20);

        const negativeSeedTerms = ["free", "jobs", "career", "cheap", "diy", "training", "course", "certification"];
        const negativeIdeas = searchTermRows
            .filter((r) => r.clicks >= 6 && r.conversions <= 0 && (includesAny(r.term, negativeSeedTerms) || r.cost >= Math.max(8, medianCost * 0.08)))
            .sort((a, b) => b.cost - a.cost || b.clicks - a.clicks)
            .slice(0, 25);

        const ctrProblems = campaignRows
            .filter((r) => r.impressions >= 300 && r.ctr > 0 && r.ctr < Math.max(0.01, medianCtr * 0.7))
            .sort((a, b) => a.ctr - b.ctr)
            .slice(0, 20);

        const curr = (summary.summary || {}) as AdsSummaryPayload;
        const prev = (summaryPrev.summary || {}) as AdsSummaryPayload;

        const compare = {
            windowDays: (() => {
                const start = Date.parse(`${s(curr.startDate)}T00:00:00Z`);
                const end = Date.parse(`${s(curr.endDate)}T00:00:00Z`);
                if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
                return Math.floor((end - start) / 86_400_000) + 1;
            })(),
            current: {
                startDate: s(curr.startDate) || null,
                endDate: s(curr.endDate) || null,
                impressions: num(curr.impressions),
                clicks: num(curr.clicks),
                cost: num(curr.cost),
                conversions: num(curr.conversions),
                avgCpc: num(curr.avgCpc),
                ctr: num(curr.ctr),
                roas: num(curr.roas),
            },
            previous: {
                startDate: s(prev.startDate) || null,
                endDate: s(prev.endDate) || null,
                impressions: num(prev.impressions),
                clicks: num(prev.clicks),
                cost: num(prev.cost),
                conversions: num(prev.conversions),
                avgCpc: num(prev.avgCpc),
                ctr: num(prev.ctr),
                roas: num(prev.roas),
            },
            pct: {
                impressions: pct(num(curr.impressions), num(prev.impressions)),
                clicks: pct(num(curr.clicks), num(prev.clicks)),
                cost: pct(num(curr.cost), num(prev.cost)),
                conversions: pct(num(curr.conversions), num(prev.conversions)),
                avgCpc: pct(num(curr.avgCpc), num(prev.avgCpc)),
                ctr: pct(num(curr.ctr), num(prev.ctr)),
                roas: pct(num(curr.roas), num(prev.roas)),
            },
        };

        const summaryOverall = {
            ...curr,
            convValue: num(curr.conversionValue),
            conversionValue: num(curr.conversionValue),
        };

        return NextResponse.json({
            ok: true,
            meta: {
                ...(meta || {}),
                customerId: s(meta?.customerId || ""),
                warning: Array.isArray(cached.warnings) && cached.warnings.length
                    ? cached.warnings.join(" | ")
                    : null,
            },
            prevMeta: cached.prevMeta || null,
            summary: summaryOverall,
            summaryOverall,
            summaryPrev: {
                ...prev,
                convValue: num(prev.conversionValue),
            },
            compare,
            trend: trendRows,
            campaigns: campaignRows,
            topCampaigns: campaignRows,
            topKeywords: keywordRows,
            searchTerms: searchTermRows,
            opportunities: {
                winners,
                losers,
                kwLeaks,
                negativeIdeas,
                ctrProblems,
            },
            generatedAt: cached.generatedAt || meta?.generatedAt || null,
        });
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}
