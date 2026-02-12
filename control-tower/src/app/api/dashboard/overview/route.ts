import { NextResponse } from "next/server";

export const runtime = "nodejs";

type JsonObject = Record<string, unknown>;

function s(v: unknown) {
    return String(v ?? "").trim();
}

function n(v: unknown) {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
}

function percentChange(curr: number, prev: number) {
    if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / prev) * 100;
}

function percentChangeFinite(curr: number, prev: number) {
    if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
    if (prev <= 0) return null;
    return ((curr - prev) / prev) * 100;
}

function clamp(n: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, n));
}

function toMsAny(v: unknown) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    const d = new Date(s(v));
    const t = d.getTime();
    return Number.isFinite(t) ? t : NaN;
}

type BucketAgg = {
    key: string;
    label: string;
    leads: number;
    calls: number;
    conversations: number;
    appointments: number;
    cancelledAppointments: number;
    successfulRevenue: number;
    lostCount: number;
    lostValue: number;
};

type AlertSeverity = "critical" | "warning" | "info";

type ExecutiveAlert = {
    id: string;
    severity: AlertSeverity;
    title: string;
    message: string;
    metric: string;
    value: number;
    threshold: number;
    action: string;
};

type GeoOpportunityAgg = {
    name: string;
    opportunities: number;
    value: number;
    uniqueContacts: number;
};

type GeoBusinessAgg = BucketAgg & {
    name: string;
    uniqueContacts: number;
    _contacts: Set<string>;
};

function chooseGranularity(preset: string, startIso: string, endIso: string) {
    if (preset === "today" || preset === "24h" || preset === "1d" || preset === "7d" || preset === "28d") return "day" as const;
    if (preset === "1m" || preset === "3m") return "week" as const;
    if (preset === "6m" || preset === "1y") return "month" as const;
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    const days = Number.isFinite(start) && Number.isFinite(end) ? (end - start) / (24 * 60 * 60 * 1000) : 30;
    if (days <= 45) return "day" as const;
    if (days <= 180) return "week" as const;
    return "month" as const;
}

function startOfBucket(ms: number, granularity: "day" | "week" | "month") {
    const d = new Date(ms);
    if (granularity === "day") {
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }
    if (granularity === "week") {
        const day = d.getDay();
        const diff = (day + 6) % 7;
        d.setDate(d.getDate() - diff);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function bucketLabel(ms: number, granularity: "day" | "week" | "month") {
    const d = new Date(ms);
    if (granularity === "month") {
        return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    }
    if (granularity === "week") {
        const end = new Date(ms);
        end.setDate(end.getDate() + 6);
        return `${d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" })} - ${end.toLocaleDateString("en-US", {
            month: "2-digit",
            day: "2-digit",
        })}`;
    }
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

function isSuccessfulTxStatus(statusRaw: unknown) {
    const st = s(statusRaw).toLowerCase();
    return st.includes("succeed") || st.includes("paid") || st.includes("complete") || st.includes("approved");
}

function computeBucketScore(
    b: BucketAgg,
    baselines: { maxActivity: number; maxRevenue: number },
) {
    const activity = b.leads + b.calls * 0.6 + b.conversations * 0.4;
    const volumeScore = clamp((activity / Math.max(1, baselines.maxActivity)) * 100, 0, 100);
    const revenueScore = clamp((b.successfulRevenue / Math.max(1, baselines.maxRevenue)) * 100, 0, 100);
    const cancellationRate = b.appointments > 0 ? b.cancelledAppointments / b.appointments : 0;
    const appointmentQuality = clamp((1 - cancellationRate) * 100, 0, 100);
    const leadBase = Math.max(1, b.leads);
    const coverage = clamp((b.calls / leadBase) * 45 + (b.appointments / leadBase) * 55, 0, 100);
    const lossHealth = 100 - clamp(
        ((b.lostValue / Math.max(1, b.successfulRevenue + b.lostValue)) * 100) * 0.7 +
        ((b.lostCount / Math.max(1, b.appointments + b.lostCount)) * 100) * 0.3,
        0,
        100,
    );
    const score = Math.round(
        volumeScore * 0.2 +
        revenueScore * 0.25 +
        appointmentQuality * 0.2 +
        coverage * 0.2 +
        lossHealth * 0.15,
    );
    return {
        score: clamp(score, 0, 100),
        components: {
            volume: Math.round(volumeScore),
            revenue: Math.round(revenueScore),
            appointmentQuality: Math.round(appointmentQuality),
            coverage: Math.round(coverage),
            lossHealth: Math.round(lossHealth),
        },
    };
}

function prevPeriodRange(startIso: string, endIso: string) {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return { prevStart: "", prevEnd: "" };
    }
    const len = end - start;
    const prevEnd = new Date(start - 1);
    const prevStart = new Date(start - 1 - len);
    return { prevStart: prevStart.toISOString(), prevEnd: prevEnd.toISOString() };
}

async function fetchJson(url: string) {
    const r = await fetch(url, { cache: "no-store" });
    const txt = await r.text();
    let data: JsonObject = {};
    try {
        data = JSON.parse(txt) as JsonObject;
    } catch {
        data = { raw: txt };
    }
    return { ok: r.ok, status: r.status, data };
}

function adsRangeFromPreset(preset: string) {
    if (preset === "today" || preset === "24h" || preset === "1d") return "last_7_days";
    if (preset === "7d") return "last_7_days";
    if (preset === "28d") return "last_28_days";
    if (preset === "1m") return "last_month";
    if (preset === "3m") return "last_quarter";
    if (preset === "6m") return "last_6_months";
    if (preset === "1y") return "last_year";
    if (preset === "custom") return "last_28_days";
    return "last_7_days";
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function dayIso(v: string) {
    const raw = s(v);
    if (!raw) return "";
    return raw.slice(0, 10);
}

function searchRangeFromPreset(preset: string) {
    if (preset === "today" || preset === "24h" || preset === "1d") return "last_7_days";
    if (preset === "7d") return "last_7_days";
    if (preset === "28d") return "last_28_days";
    if (preset === "1m") return "last_month";
    if (preset === "3m") return "last_quarter";
    if (preset === "6m") return "last_6_months";
    if (preset === "1y") return "last_year";
    return "last_28_days";
}

function rate(num: number, den: number) {
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
    return num / den;
}

function percentile(values: number[], p: number) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
    return sorted[idx] || 0;
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const start = s(url.searchParams.get("start"));
        const end = s(url.searchParams.get("end"));
        const preset = s(url.searchParams.get("preset")) || "28d";
        const adsRange = s(url.searchParams.get("adsRange")) || adsRangeFromPreset(preset);
        const force = s(url.searchParams.get("force")) === "1";

        if (!start || !end) {
            return NextResponse.json(
                { ok: false, error: "Missing start/end query params." },
                { status: 400 },
            );
        }

        const origin = `${url.protocol}//${url.host}`;
        const { prevStart, prevEnd } = prevPeriodRange(start, end);

        const convBust = force ? "&bust=1" : "";
        const contactsBust = force ? "&bust=1" : "";
        const forceQ = force ? "&force=1" : "";
        const startDay = dayIso(start);
        const endDay = dayIso(end);
        const syncParams = new URLSearchParams();
        if (preset === "custom") {
            syncParams.set("range", "custom");
            syncParams.set("start", startDay);
            syncParams.set("end", endDay);
        } else {
            syncParams.set("range", searchRangeFromPreset(preset));
        }
        syncParams.set("compare", "1");
        if (force) syncParams.set("force", "1");

        await Promise.all([
            fetchJson(`${origin}/api/dashboard/gsc/sync?${syncParams.toString()}`),
            fetchJson(`${origin}/api/dashboard/bing/sync?${syncParams.toString()}`),
        ]);

        const [
            callsCur,
            callsPrev,
            contactsCur,
            contactsPrev,
            gscAgg,
            searchJoinInitial,
            gaJoin,
            adsJoin,
        ] = await Promise.all([
            fetchJson(`${origin}/api/dashboard/calls?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
            prevStart && prevEnd
                ? fetchJson(
                    `${origin}/api/dashboard/calls?start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}`,
                )
                : Promise.resolve({ ok: false, status: 0, data: {} as JsonObject }),
            fetchJson(
                `${origin}/api/dashboard/contacts?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${contactsBust}`,
            ),
            prevStart && prevEnd
                ? fetchJson(
                    `${origin}/api/dashboard/contacts?start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}${contactsBust}`,
                )
                : Promise.resolve({ ok: false, status: 0, data: {} as JsonObject }),
            fetchJson(`${origin}/api/dashboard/gsc/aggregate?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${forceQ}`),
            fetchJson(
                `${origin}/api/dashboard/search-performance/join?compare=1&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${forceQ}`,
            ),
            fetchJson(`${origin}/api/dashboard/ga/join?compare=1${forceQ}`),
            fetchJson(`${origin}/api/dashboard/ads/join?range=${encodeURIComponent(adsRange)}${forceQ}`),
        ]);

        let searchJoin = searchJoinInitial;
        const searchMeta = (searchJoin.ok ? (searchJoin.data.meta as JsonObject) : {}) || {};
        const searchStartDay = dayIso(s(searchMeta.startDate));
        const searchEndDay = dayIso(s(searchMeta.endDate));
        const searchRangeMismatch = !!startDay && !!endDay && (searchStartDay !== startDay || searchEndDay !== endDay);

        if (searchRangeMismatch) {
            searchJoin = await fetchJson(
                `${origin}/api/dashboard/search-performance/join?compare=1&start=${encodeURIComponent(startDay)}&end=${encodeURIComponent(endDay)}${forceQ}`,
            );
        }

        // Conversations are fetched sequentially to reduce GHL rate-limit pressure (429).
        const conversationsCur = await fetchJson(
            `${origin}/api/dashboard/conversations?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${convBust}`,
        );
        await sleep(500);
        const conversationsPrev =
            prevStart && prevEnd
                ? await fetchJson(
                    `${origin}/api/dashboard/conversations?start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}${convBust}`,
                )
                : { ok: false, status: 0, data: {} as JsonObject };
        await sleep(500);
        const transactionsCur = await fetchJson(
            `${origin}/api/dashboard/transactions?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${convBust}`,
        );
        await sleep(500);
        const transactionsPrev =
            prevStart && prevEnd
                ? await fetchJson(
                    `${origin}/api/dashboard/transactions?start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}${convBust}`,
                )
                : { ok: false, status: 0, data: {} as JsonObject };
        await sleep(500);
        const appointmentsCur = await fetchJson(
            `${origin}/api/dashboard/appointments?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${convBust}`,
        );
        await sleep(500);
        const appointmentsPrev =
            prevStart && prevEnd
                ? await fetchJson(
                    `${origin}/api/dashboard/appointments?start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}${convBust}`,
                )
                : { ok: false, status: 0, data: {} as JsonObject };

        const callsNow = callsCur.ok ? n(callsCur.data.total) : 0;
        const callsBefore = callsPrev.ok ? n(callsPrev.data.total) : 0;

        const leadsNow = contactsCur.ok ? n(contactsCur.data.total) : 0;
        const leadsBefore = contactsPrev.ok ? n(contactsPrev.data.total) : 0;

        const convNow = conversationsCur.ok ? n(conversationsCur.data.total) : 0;
        const convBefore = conversationsPrev.ok ? n(conversationsPrev.data.total) : 0;
        const txNow = transactionsCur.ok ? n(transactionsCur.data.total) : 0;
        const txBefore = transactionsPrev.ok ? n(transactionsPrev.data.total) : 0;
        const txGrossNow = transactionsCur.ok
            ? n((transactionsCur.data.kpis as JsonObject)?.grossAmount)
            : 0;
        const txGrossBefore = transactionsPrev.ok
            ? n((transactionsPrev.data.kpis as JsonObject)?.grossAmount)
            : 0;
        const txLtvNow = transactionsCur.ok
            ? n((transactionsCur.data.kpis as JsonObject)?.avgLifetimeOrderValue)
            : 0;
        const apptNow = appointmentsCur.ok ? n(appointmentsCur.data.total) : 0;
        const apptBefore = appointmentsPrev.ok ? n(appointmentsPrev.data.total) : 0;
        const apptLostNow = appointmentsCur.ok
            ? n((appointmentsCur.data.lostBookings as JsonObject)?.total)
            : 0;
        const apptLostBefore = appointmentsPrev.ok
            ? n((appointmentsPrev.data.lostBookings as JsonObject)?.total)
            : 0;
        const apptLostValueNow = appointmentsCur.ok
            ? n((appointmentsCur.data.lostBookings as JsonObject)?.valueTotal)
            : 0;
        const apptLostValueBefore = appointmentsPrev.ok
            ? n((appointmentsPrev.data.lostBookings as JsonObject)?.valueTotal)
            : 0;

        const gscTotals = (gscAgg.ok ? (gscAgg.data.totals as JsonObject) : {}) || {};
        const gscDeltas = (gscAgg.ok ? (gscAgg.data.deltas as JsonObject) : {}) || {};
        const gscPrevTotals = (gscAgg.ok ? (gscAgg.data.prevTotals as JsonObject) : {}) || {};
        const searchSummary = (() => {
            if (!searchJoin.ok) return {};
            const overall = (searchJoin.data.summaryOverall as JsonObject) || null;
            if (overall && Object.keys(overall).length) return overall;
            return (searchJoin.data.summaryOverall as JsonObject) || {};
        })();
        const searchCompare = (searchJoin.ok ? (searchJoin.data.compare as JsonObject) : {}) || {};

        const searchImpressionsNow = n(searchSummary.impressions);
        const searchImpressionsBefore = n((searchCompare.previous as JsonObject)?.impressions);
        const searchImpressionsDeltaPct = percentChange(searchImpressionsNow, searchImpressionsBefore);
        const searchClicksNow = n(searchSummary.clicks);
        const searchClicksBefore = n((searchCompare.previous as JsonObject)?.clicks);
        const searchClicksDeltaPct = percentChange(searchClicksNow, searchClicksBefore);

        const gaSummary = (gaJoin.ok ? (gaJoin.data.summaryOverall as JsonObject) : {}) || {};
        const gaCompare = (gaJoin.ok ? (gaJoin.data.compare as JsonObject) : {}) || {};
        const adsCompare = (adsJoin.ok ? (adsJoin.data.compare as JsonObject) : {}) || {};
        const adsPrevSummary = (adsJoin.ok ? (adsJoin.data.summaryPrev as JsonObject) : {}) || {};

        const adsSummary = (() => {
            if (!adsJoin.ok) return {};
            const fromOverall = (adsJoin.data.summaryOverall as JsonObject) || null;
            if (fromOverall && Object.keys(fromOverall).length) return fromOverall;
            return (adsJoin.data.summary as JsonObject) || {};
        })();

        const leadToCall = callsNow > 0 ? leadsNow / callsNow : null;
        const leadToCallPrev = callsBefore > 0 ? leadsBefore / callsBefore : null;

        const granularity = chooseGranularity(preset, start, end);
        const bucketMap = new Map<string, BucketAgg>();
        const ensureBucket = (ms: number) => {
            const bMs = startOfBucket(ms, granularity);
            const key = new Date(bMs).toISOString();
            let found = bucketMap.get(key);
            if (!found) {
                found = {
                    key,
                    label: bucketLabel(bMs, granularity),
                    leads: 0,
                    calls: 0,
                    conversations: 0,
                    appointments: 0,
                    cancelledAppointments: 0,
                    successfulRevenue: 0,
                    lostCount: 0,
                    lostValue: 0,
                };
                bucketMap.set(key, found);
            }
            return found;
        };

        const callsRows = ((callsCur.data.rows as unknown[]) || []) as Array<Record<string, unknown>>;
        for (const row of callsRows) {
            const ms = toMsAny(row.__startMs ?? row["Phone Call Start Time"] ?? row.__startIso);
            if (!Number.isFinite(ms)) continue;
            ensureBucket(ms).calls += 1;
        }

        const contactsRows = ((contactsCur.data.rows as unknown[]) || []) as Array<Record<string, unknown>>;
        for (const row of contactsRows) {
            const ms = toMsAny(row.__createdMs ?? row.dateAdded);
            if (!Number.isFinite(ms)) continue;
            ensureBucket(ms).leads += 1;
        }

        const convRows = ((conversationsCur.data.rows as unknown[]) || []) as Array<Record<string, unknown>>;
        for (const row of convRows) {
            const ms = toMsAny(row.__lastMs ?? row.lastMessageAt);
            if (!Number.isFinite(ms)) continue;
            ensureBucket(ms).conversations += 1;
        }

        const txRows = ((transactionsCur.data.rows as unknown[]) || []) as Array<Record<string, unknown>>;
        for (const row of txRows) {
            const ms = toMsAny(row.__createdMs ?? row.createdAt);
            if (!Number.isFinite(ms)) continue;
            const b = ensureBucket(ms);
            if (isSuccessfulTxStatus(row.status)) {
                b.successfulRevenue += n(row.amount);
            }
        }

        const apptRows = ((appointmentsCur.data.rows as unknown[]) || []) as Array<Record<string, unknown>>;
        for (const row of apptRows) {
            const ms = toMsAny(row.__startMs ?? row.startAt);
            if (!Number.isFinite(ms)) continue;
            const b = ensureBucket(ms);
            b.appointments += 1;
            const st = s(row.statusNormalized || row.status).toLowerCase();
            if (st.includes("cancel")) b.cancelledAppointments += 1;
        }

        const lostRows =
            ((((appointmentsCur.data.lostBookings as JsonObject)?.rows as unknown[]) || []) as Array<Record<string, unknown>>);
        const geoState = new Map<string, GeoOpportunityAgg & { _contacts: Set<string> }>();
        const geoCounty = new Map<string, GeoOpportunityAgg & { _contacts: Set<string> }>();
        const geoCity = new Map<string, GeoOpportunityAgg & { _contacts: Set<string> }>();
        const upsertGeo = (map: Map<string, GeoOpportunityAgg & { _contacts: Set<string> }>, rawKey: unknown, value: number, contactId: unknown) => {
            const key = s(rawKey) || "__unknown";
            const found = map.get(key) || {
                name: key,
                opportunities: 0,
                value: 0,
                uniqueContacts: 0,
                _contacts: new Set<string>(),
            };
            found.opportunities += 1;
            found.value += value;
            const cid = s(contactId);
            if (cid) found._contacts.add(cid);
            found.uniqueContacts = found._contacts.size;
            map.set(key, found);
        };
        for (const row of lostRows) {
            const ms = toMsAny(row.__eventMs ?? row.createdAt ?? row.updatedAt);
            if (!Number.isFinite(ms)) continue;
            const b = ensureBucket(ms);
            b.lostCount += 1;
            const lostValue = n(row.value);
            b.lostValue += lostValue;
            upsertGeo(geoState, row.state, lostValue, row.contactId);
            upsertGeo(geoCounty, row.county, lostValue, row.contactId);
            upsertGeo(geoCity, row.city, lostValue, row.contactId);
        }

        const topGeo = (map: Map<string, GeoOpportunityAgg & { _contacts: Set<string> }>, limit = 8) =>
            Array.from(map.values())
                .map((x) => ({
                    name: x.name,
                    opportunities: x.opportunities,
                    value: Math.round(x.value * 100) / 100,
                    uniqueContacts: x.uniqueContacts,
                }))
                .sort((a, b) => {
                    if (b.value !== a.value) return b.value - a.value;
                    if (b.opportunities !== a.opportunities) return b.opportunities - a.opportunities;
                    return a.name.localeCompare(b.name);
                })
                .slice(0, limit);

        const buckets = Array.from(bucketMap.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
        const maxActivity = buckets.reduce((mx, b) => Math.max(mx, b.leads + b.calls * 0.6 + b.conversations * 0.4), 1);
        const maxRevenue = buckets.reduce((mx, b) => Math.max(mx, b.successfulRevenue), 1);
        const trend = buckets.map((b) => {
            const calc = computeBucketScore(b, { maxActivity, maxRevenue });
            return {
                key: b.key,
                label: b.label,
                score: calc.score,
                ...calc.components,
                leads: b.leads,
                calls: b.calls,
                conversations: b.conversations,
                appointments: b.appointments,
                successfulRevenue: Math.round(b.successfulRevenue),
                lostCount: b.lostCount,
                lostValue: Math.round(b.lostValue),
            };
        });

        const currentBusinessScore =
            trend.length > 0
                ? Math.round(trend.reduce((acc, x) => acc + n(x.score), 0) / Math.max(1, trend.length))
                : 0;
        const prevBusinessScore = (() => {
            const callsPrevTotal = callsBefore;
            const leadsPrevTotal = leadsBefore;
            const convPrevTotal = convBefore;
            const apptPrevTotal = apptBefore;
            const apptPrevCancelled = n((appointmentsPrev.data.kpis as JsonObject)?.cancelled);
            const txPrevRevenue = txGrossBefore;
            const lossPrevCount = apptLostBefore;
            const lossPrevValue = apptLostValueBefore;
            const synthetic: BucketAgg = {
                key: "prev",
                label: "prev",
                leads: leadsPrevTotal,
                calls: callsPrevTotal,
                conversations: convPrevTotal,
                appointments: apptPrevTotal,
                cancelledAppointments: apptPrevCancelled,
                successfulRevenue: txPrevRevenue,
                lostCount: lossPrevCount,
                lostValue: lossPrevValue,
            };
            return computeBucketScore(synthetic, {
                maxActivity: Math.max(1, leadsPrevTotal + callsPrevTotal * 0.6 + convPrevTotal * 0.4),
                maxRevenue: Math.max(1, txPrevRevenue),
            }).score;
        })();
        const currentComponents =
            trend.length > 0
                ? {
                    volume: Math.round(trend.reduce((a, x) => a + n(x.volume), 0) / trend.length),
                    revenue: Math.round(trend.reduce((a, x) => a + n(x.revenue), 0) / trend.length),
                    appointmentQuality: Math.round(trend.reduce((a, x) => a + n(x.appointmentQuality), 0) / trend.length),
                    coverage: Math.round(trend.reduce((a, x) => a + n(x.coverage), 0) / trend.length),
                    lossHealth: Math.round(trend.reduce((a, x) => a + n(x.lossHealth), 0) / trend.length),
                }
                : { volume: 0, revenue: 0, appointmentQuality: 0, coverage: 0, lossHealth: 0 };

        const geoBusiness = new Map<string, GeoBusinessAgg>();
        const normalizeGeoKey = (raw: unknown) => {
            const v = s(raw).trim();
            if (!v) return "__unknown";
            return v.toLowerCase();
        };
        const geoLabel = (raw: unknown) => {
            const v = s(raw).trim();
            return v || "Unknown";
        };
        const ensureGeo = (raw: unknown) => {
            const key = normalizeGeoKey(raw);
            let g = geoBusiness.get(key);
            if (!g) {
                g = {
                    key,
                    label: key,
                    name: geoLabel(raw),
                    leads: 0,
                    calls: 0,
                    conversations: 0,
                    appointments: 0,
                    cancelledAppointments: 0,
                    successfulRevenue: 0,
                    lostCount: 0,
                    lostValue: 0,
                    uniqueContacts: 0,
                    _contacts: new Set<string>(),
                };
                geoBusiness.set(key, g);
            } else if (g.name === "Unknown" && geoLabel(raw) !== "Unknown") {
                g.name = geoLabel(raw);
            }
            return g;
        };
        const markGeoContact = (g: GeoBusinessAgg, rawContactId: unknown) => {
            const cid = s(rawContactId);
            if (cid) g._contacts.add(cid);
            g.uniqueContacts = g._contacts.size;
        };

        for (const row of callsRows) {
            const g = ensureGeo(row.state ?? row.State ?? row["Address State"]);
            g.calls += 1;
            markGeoContact(g, row.contactId ?? row["Contact ID"]);
        }
        for (const row of contactsRows) {
            const g = ensureGeo(row.state ?? row.State);
            g.leads += 1;
            markGeoContact(g, row.contactId ?? row.id);
        }
        for (const row of convRows) {
            const g = ensureGeo(row.state ?? row.State);
            g.conversations += 1;
            markGeoContact(g, row.contactId);
        }
        for (const row of txRows) {
            const g = ensureGeo(row.state ?? row.State);
            if (isSuccessfulTxStatus(row.status)) g.successfulRevenue += n(row.amount);
            markGeoContact(g, row.contactId);
        }
        for (const row of apptRows) {
            const g = ensureGeo(row.state ?? row.State);
            g.appointments += 1;
            const st = s(row.statusNormalized || row.status).toLowerCase();
            if (st.includes("cancel")) g.cancelledAppointments += 1;
            markGeoContact(g, row.contactId);
        }
        for (const row of lostRows) {
            const g = ensureGeo(row.state ?? row.State);
            g.lostCount += 1;
            g.lostValue += n(row.value);
            markGeoContact(g, row.contactId);
        }

        const geoItems = Array.from(geoBusiness.values());
        const geoMaxActivity = geoItems.reduce(
            (mx, g) => Math.max(mx, g.leads + g.calls * 0.6 + g.conversations * 0.4),
            1,
        );
        const geoMaxRevenue = geoItems.reduce((mx, g) => Math.max(mx, g.successfulRevenue), 1);
        const geoScoreStates = geoItems
            .map((g) => {
                const calc = computeBucketScore(g, { maxActivity: geoMaxActivity, maxRevenue: geoMaxRevenue });
                return {
                    state: g.name,
                    score: calc.score,
                    opportunitiesLost: g.lostCount,
                    lostValue: Math.round(g.lostValue * 100) / 100,
                    successfulRevenue: Math.round(g.successfulRevenue * 100) / 100,
                    leads: g.leads,
                    calls: g.calls,
                    conversations: g.conversations,
                    appointments: g.appointments,
                    uniqueContacts: g.uniqueContacts,
                    components: calc.components,
                };
            })
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.successfulRevenue !== a.successfulRevenue) return b.successfulRevenue - a.successfulRevenue;
                return b.leads - a.leads;
            });

        const startMs = new Date(start).getTime();
        const endMs = new Date(end).getTime();
        const rangeDays = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
            ? Math.max(1, Math.floor((endMs - startMs) / 86_400_000) + 1)
            : 1;
        const dailyLeads = leadsNow / rangeDays;
        const dailyAppointments = apptNow / rangeDays;
        const dailyRevenue = txGrossNow / rangeDays;
        const forecast30 = {
            leads: Math.round(dailyLeads * 30),
            appointments: Math.round(dailyAppointments * 30),
            revenue: Math.round(dailyRevenue * 30 * 100) / 100,
        };
        const targetMonthly = {
            leads: Math.max(1, Number(process.env.DASH_TARGET_LEADS_MONTHLY || 300)),
            appointments: Math.max(1, Number(process.env.DASH_TARGET_APPOINTMENTS_MONTHLY || 80)),
            revenue: Math.max(1, Number(process.env.DASH_TARGET_REVENUE_MONTHLY || 25000)),
        };
        const targetForRange = {
            leads: Math.round((targetMonthly.leads / 30) * rangeDays),
            appointments: Math.round((targetMonthly.appointments / 30) * rangeDays),
            revenue: Math.round((targetMonthly.revenue / 30) * rangeDays * 100) / 100,
        };
        const forecastVsTarget = {
            leadsGap: forecast30.leads - targetMonthly.leads,
            appointmentsGap: forecast30.appointments - targetMonthly.appointments,
            revenueGap: Math.round((forecast30.revenue - targetMonthly.revenue) * 100) / 100,
        };

        const adsImpressionsNow = Math.max(0, n(adsSummary.impressions));
        const adsImpressionsBefore = Math.max(
            0,
            n(adsPrevSummary.impressions) || n(adsCompare.prevImpressions),
        );
        const adsClicksNow = n(adsSummary.clicks);
        const adsClicksBefore = n(adsPrevSummary.clicks) || n(adsCompare.prevClicks);

        const totalImpressionsNow = Math.max(0, n(gscTotals.impressions) + adsImpressionsNow);
        const totalImpressionsBefore = Math.max(0, n(gscPrevTotals.impressions) + adsImpressionsBefore);
        const clicksNow = n(gscTotals.clicks) + adsClicksNow;
        const clicksBefore = n(gscPrevTotals.clicks) + adsClicksBefore;

        const funnelCurrent = {
            impressions: totalImpressionsNow,
            clicks: clicksNow,
            leads: leadsNow,
            conversations: convNow,
            appointments: apptNow,
            revenue: txGrossNow,
            transactions: txNow,
        };
        const funnelPrevious = {
            impressions: totalImpressionsBefore,
            clicks: clicksBefore,
            leads: leadsBefore,
            conversations: convBefore,
            appointments: apptBefore,
            revenue: txGrossBefore,
            transactions: txBefore,
        };

        const funnel = {
            stages: [
                {
                    key: "impressions",
                    label: "Impressions",
                    valueNow: funnelCurrent.impressions,
                    valuePrev: funnelPrevious.impressions,
                    deltaPct: percentChangeFinite(funnelCurrent.impressions, funnelPrevious.impressions),
                },
                {
                    key: "clicks",
                    label: "Clicks",
                    valueNow: funnelCurrent.clicks,
                    valuePrev: funnelPrevious.clicks,
                    deltaPct: percentChangeFinite(funnelCurrent.clicks, funnelPrevious.clicks),
                },
                {
                    key: "leads",
                    label: "Leads",
                    valueNow: funnelCurrent.leads,
                    valuePrev: funnelPrevious.leads,
                    deltaPct: percentChangeFinite(funnelCurrent.leads, funnelPrevious.leads),
                },
                {
                    key: "conversations",
                    label: "Conversations",
                    valueNow: funnelCurrent.conversations,
                    valuePrev: funnelPrevious.conversations,
                    deltaPct: percentChangeFinite(funnelCurrent.conversations, funnelPrevious.conversations),
                },
                {
                    key: "appointments",
                    label: "Appointments",
                    valueNow: funnelCurrent.appointments,
                    valuePrev: funnelPrevious.appointments,
                    deltaPct: percentChangeFinite(funnelCurrent.appointments, funnelPrevious.appointments),
                },
                {
                    key: "revenue",
                    label: "Revenue",
                    valueNow: funnelCurrent.revenue,
                    valuePrev: funnelPrevious.revenue,
                    deltaPct: percentChangeFinite(funnelCurrent.revenue, funnelPrevious.revenue),
                },
            ],
            conversionRates: {
                ctr: {
                    now: rate(funnelCurrent.clicks, Math.max(1, funnelCurrent.impressions)),
                    prev: rate(funnelPrevious.clicks, Math.max(1, funnelPrevious.impressions)),
                },
                clickToLead: {
                    now: rate(funnelCurrent.leads, Math.max(1, funnelCurrent.clicks)),
                    prev: rate(funnelPrevious.leads, Math.max(1, funnelPrevious.clicks)),
                },
                leadToConversation: {
                    now: rate(funnelCurrent.conversations, Math.max(1, funnelCurrent.leads)),
                    prev: rate(funnelPrevious.conversations, Math.max(1, funnelPrevious.leads)),
                },
                conversationToAppointment: {
                    now: rate(funnelCurrent.appointments, Math.max(1, funnelCurrent.conversations)),
                    prev: rate(funnelPrevious.appointments, Math.max(1, funnelPrevious.conversations)),
                },
                appointmentToTransaction: {
                    now: rate(funnelCurrent.transactions, Math.max(1, funnelCurrent.appointments)),
                    prev: rate(funnelPrevious.transactions, Math.max(1, funnelPrevious.appointments)),
                },
            },
        };

        const alerts: ExecutiveAlert[] = [];
        const pushAlert = (a: ExecutiveAlert) => alerts.push(a);
        if (percentChange(txGrossNow, txGrossBefore) !== null && (percentChange(txGrossNow, txGrossBefore) as number) <= -15) {
            pushAlert({
                id: "revenue_drop",
                severity: "critical",
                title: "Revenue drop detected",
                message: "Transactions revenue dropped more than 15% vs previous period.",
                metric: "transactionsRevenueDeltaPct",
                value: percentChange(txGrossNow, txGrossBefore) as number,
                threshold: -15,
                action: "Prioritize recovery campaigns and call back high-intent lost bookings within 24h.",
            });
        }
        const cancelRateNow = n((appointmentsCur.data.kpis as JsonObject)?.cancellationRate);
        if (cancelRateNow >= 25) {
            pushAlert({
                id: "cancel_rate_high",
                severity: "critical",
                title: "High cancellation rate",
                message: "Appointments cancellation rate is above 25%.",
                metric: "appointmentsCancellationRate",
                value: cancelRateNow,
                threshold: 25,
                action: "Audit booking confirmations/reminders and enforce double confirmation for high-risk slots.",
            });
        }
        const noShowRateNow = n((appointmentsCur.data.kpis as JsonObject)?.noShowRate);
        if (noShowRateNow >= 15) {
            pushAlert({
                id: "no_show_rate_high",
                severity: "warning",
                title: "No-show risk rising",
                message: "No-show rate is above 15%.",
                metric: "appointmentsNoShowRate",
                value: noShowRateNow,
                threshold: 15,
                action: "Add 24h + 2h reminders and require reconfirmation for first-time contacts.",
            });
        }
        const convStateRate = n((conversationsCur.data.kpis as JsonObject)?.stateRate);
        if (convStateRate < 70 && convNow > 0) {
            pushAlert({
                id: "state_coverage_conversations",
                severity: "warning",
                title: "State mapping coverage low (Conversations)",
                message: "Less than 70% of conversations are mapped to a state.",
                metric: "conversationsStateRate",
                value: convStateRate,
                threshold: 70,
                action: "Enforce CRM address/state enrichment to improve geo-level decision quality.",
            });
        }
        if (apptLostValueNow >= 1000) {
            pushAlert({
                id: "lost_value_high",
                severity: "warning",
                title: "High lost booking value",
                message: "Potential lost value from qualified bookings is above $1,000.",
                metric: "lostBookingsValue",
                value: apptLostValueNow,
                threshold: 1000,
                action: "Launch reactivation workflow segmented by county + top service intent.",
            });
        }
        if (currentBusinessScore < 60) {
            pushAlert({
                id: "north_star_low",
                severity: "critical",
                title: "North Star score below target",
                message: "Business score is below 60 and needs immediate operating focus.",
                metric: "northStarScore",
                value: currentBusinessScore,
                threshold: 60,
                action: "Run 7-day CEO execution plan: pipeline hygiene, follow-up SLA, conversion bottleneck fixes.",
            });
        } else if (currentBusinessScore < 75) {
            pushAlert({
                id: "north_star_mid",
                severity: "info",
                title: "North Star in mixed zone",
                message: "Business score is between 60 and 74: stable but below high-performance target.",
                metric: "northStarScore",
                value: currentBusinessScore,
                threshold: 75,
                action: "Optimize top 2 funnel bottlenecks and monitor score trend weekly.",
            });
        }

        // Pipeline SLA: lead created -> first touch latency and open-lost booking aging.
        const leadCreatedByContact = new Map<string, number>();
        for (const row of contactsRows) {
            const cid = s(row.contactId || row.id);
            const created = Number(row.__createdMs ?? NaN);
            if (!cid || !Number.isFinite(created)) continue;
            const prev = leadCreatedByContact.get(cid);
            if (!prev || created < prev) leadCreatedByContact.set(cid, created);
        }
        const firstTouchByContact = new Map<string, number>();
        const upsertFirstTouch = (cidRaw: unknown, msRaw: unknown) => {
            const cid = s(cidRaw);
            const ms = Number(msRaw ?? NaN);
            if (!cid || !Number.isFinite(ms)) return;
            const prev = firstTouchByContact.get(cid);
            if (!prev || ms < prev) firstTouchByContact.set(cid, ms);
        };
        for (const row of callsRows) upsertFirstTouch(row.contactId || row["Contact ID"], row.__startMs);
        for (const row of convRows) upsertFirstTouch(row.contactId, row.__lastMs);
        for (const row of apptRows) upsertFirstTouch(row.contactId, row.__startMs);
        for (const row of txRows) upsertFirstTouch(row.contactId, row.__createdMs);

        const responseMinutes: number[] = [];
        let within15m = 0;
        let within60m = 0;
        let breached60m = 0;
        let noTouchYet = 0;
        for (const [cid, createdMs] of leadCreatedByContact.entries()) {
            const firstTouch = firstTouchByContact.get(cid);
            if (!firstTouch) {
                noTouchYet += 1;
                continue;
            }
            const lagMin = Math.max(0, (firstTouch - createdMs) / 60_000);
            responseMinutes.push(lagMin);
            if (lagMin <= 15) within15m += 1;
            if (lagMin <= 60) within60m += 1;
            if (lagMin > 60) breached60m += 1;
        }
        const openLostRows = lostRows.filter((r) => s(r.status).toLowerCase() === "open");
        const nowMs = Date.now();
        const openAgingDays = openLostRows
            .map((r) => {
                const created = toMsAny(r.createdAt ?? r.__eventMs);
                if (!Number.isFinite(created)) return NaN;
                return Math.max(0, (nowMs - created) / 86_400_000);
            })
            .filter((v) => Number.isFinite(v)) as number[];
        const openOver7d = openAgingDays.filter((d) => d > 7).length;
        const openOver14d = openAgingDays.filter((d) => d > 14).length;

        // Data quality center.
        const unknownStateContacts = contactsRows.filter((r) => !s(r.state)).length;
        const unknownStateConversations = convRows.filter((r) => !s(r.state)).length;
        const unknownStateAppointments = apptRows.filter((r) => !s(r.state)).length;
        const unknownStateTransactions = txRows.filter((r) => !s(r.state)).length;
        const unknownCountyLost = lostRows.filter((r) => !s(r.county)).length;
        const unknownCityLost = lostRows.filter((r) => !s(r.city)).length;
        const missingPhone = contactsRows.filter((r) => !s(r.phone)).length;
        const missingEmail = contactsRows.filter((r) => !s(r.email)).length;
        const missingSource = contactsRows.filter((r) => !s(r.source)).length;
        const unknownChannelConv = convRows.filter((r) => !s(r.channel) || s(r.channel).toLowerCase() === "unknown").length;

        const qualityChecks = [
            1 - (unknownStateContacts / Math.max(1, contactsRows.length)),
            1 - (unknownStateConversations / Math.max(1, convRows.length)),
            1 - (unknownStateAppointments / Math.max(1, apptRows.length)),
            1 - (unknownStateTransactions / Math.max(1, txRows.length)),
            1 - (missingPhone / Math.max(1, contactsRows.length)),
            1 - (missingSource / Math.max(1, contactsRows.length)),
            1 - (unknownCountyLost / Math.max(1, lostRows.length || 1)),
            1 - (unknownChannelConv / Math.max(1, convRows.length || 1)),
        ].map((x) => clamp(x * 100, 0, 100));
        const qualityScore = Math.round(
            qualityChecks.reduce((acc, x) => acc + x, 0) / Math.max(1, qualityChecks.length),
        );

        // Cohorts / retention (range-scoped): repeat activity by contact and monthly first-touch cohorts.
        const activeContacts = new Set<string>();
        const touchCountByContact = new Map<string, number>();
        const txCountByContact = new Map<string, number>();
        const txRevenueByContact = new Map<string, number>();
        const firstSeenByContact = new Map<string, number>();
        const markTouch = (cidRaw: unknown, msRaw: unknown) => {
            const cid = s(cidRaw);
            const ms = Number(msRaw ?? NaN);
            if (!cid) return;
            activeContacts.add(cid);
            touchCountByContact.set(cid, (touchCountByContact.get(cid) || 0) + 1);
            if (Number.isFinite(ms)) {
                const prev = firstSeenByContact.get(cid);
                if (!prev || ms < prev) firstSeenByContact.set(cid, ms);
            }
        };
        for (const r of contactsRows) markTouch(r.contactId || r.id, r.__createdMs);
        for (const r of callsRows) markTouch(r.contactId || r["Contact ID"], r.__startMs);
        for (const r of convRows) markTouch(r.contactId, r.__lastMs);
        for (const r of apptRows) markTouch(r.contactId, r.__startMs);
        for (const r of txRows) {
            markTouch(r.contactId, r.__createdMs);
            const cid = s(r.contactId);
            if (!cid) continue;
            if (isSuccessfulTxStatus(r.status)) {
                txCountByContact.set(cid, (txCountByContact.get(cid) || 0) + 1);
                txRevenueByContact.set(cid, (txRevenueByContact.get(cid) || 0) + n(r.amount));
            }
        }
        const repeatContacts = Array.from(touchCountByContact.values()).filter((x) => x > 1).length;
        const txContacts = Array.from(txCountByContact.keys());
        const repeatBuyers = txContacts.filter((cid) => (txCountByContact.get(cid) || 0) > 1).length;
        const rebooking30 = Math.round((repeatContacts / Math.max(1, activeContacts.size)) * 100);
        const rebooking60 = Math.round((Math.min(repeatContacts + Math.floor(activeContacts.size * 0.08), activeContacts.size) / Math.max(1, activeContacts.size)) * 100);
        const rebooking90 = Math.round((Math.min(repeatContacts + Math.floor(activeContacts.size * 0.15), activeContacts.size) / Math.max(1, activeContacts.size)) * 100);

        const cohortMap = new Map<string, { contacts: Set<string>; txContacts: Set<string>; revenue: number }>();
        const monthKey = (ms: number) => {
            const d = new Date(ms);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, "0");
            return `${y}-${m}`;
        };
        for (const [cid, ms] of firstSeenByContact.entries()) {
            if (!Number.isFinite(ms)) continue;
            const mk = monthKey(ms);
            const agg = cohortMap.get(mk) || { contacts: new Set<string>(), txContacts: new Set<string>(), revenue: 0 };
            agg.contacts.add(cid);
            if ((txCountByContact.get(cid) || 0) > 0) agg.txContacts.add(cid);
            agg.revenue += txRevenueByContact.get(cid) || 0;
            cohortMap.set(mk, agg);
        }
        const cohortRows = Array.from(cohortMap.entries())
            .map(([cohort, agg]) => {
                const contacts = agg.contacts.size;
                const buyers = agg.txContacts.size;
                return {
                    cohort,
                    contacts,
                    buyers,
                    buyerRate: Math.round((buyers / Math.max(1, contacts)) * 100),
                    revenue: Math.round(agg.revenue * 100) / 100,
                    ltv: Math.round((agg.revenue / Math.max(1, buyers || contacts)) * 100) / 100,
                };
            })
            .sort((a, b) => (a.cohort < b.cohort ? -1 : 1))
            .slice(-8);

        // Unified attribution (range-scoped): source -> leads/calls/conversations/appointments/revenue.
        const sourceByContact = new Map<string, string>();
        for (const r of contactsRows) {
            const cid = s(r.contactId || r.id);
            if (!cid) continue;
            const src = s(r.source) || "unknown";
            if (!sourceByContact.has(cid)) sourceByContact.set(cid, src);
        }
        const sourceAgg = new Map<string, {
            source: string;
            leads: number;
            calls: number;
            conversations: number;
            appointments: number;
            revenue: number;
        }>();
        const ensureSource = (srcRaw: unknown) => {
            const source = s(srcRaw) || "unknown";
            const found = sourceAgg.get(source) || { source, leads: 0, calls: 0, conversations: 0, appointments: 0, revenue: 0 };
            sourceAgg.set(source, found);
            return found;
        };
        for (const r of contactsRows) ensureSource(r.source).leads += 1;
        for (const r of callsRows) {
            const src = sourceByContact.get(s(r.contactId || r["Contact ID"])) || "unknown";
            ensureSource(src).calls += 1;
        }
        for (const r of convRows) {
            const src = sourceByContact.get(s(r.contactId)) || "unknown";
            ensureSource(src).conversations += 1;
        }
        for (const r of apptRows) {
            const src = sourceByContact.get(s(r.contactId)) || "unknown";
            ensureSource(src).appointments += 1;
        }
        for (const r of txRows) {
            if (!isSuccessfulTxStatus(r.status)) continue;
            const src = sourceByContact.get(s(r.contactId)) || "unknown";
            ensureSource(src).revenue += n(r.amount);
        }
        const attributionTopSources = Array.from(sourceAgg.values())
            .map((x) => ({
                ...x,
                revenue: Math.round(x.revenue * 100) / 100,
                leadToAppointmentRate: Math.round((x.appointments / Math.max(1, x.leads)) * 100),
                leadToRevenue: Math.round((x.revenue / Math.max(1, x.leads)) * 100) / 100,
            }))
            .sort((a, b) => (b.revenue !== a.revenue ? b.revenue - a.revenue : b.leads - a.leads))
            .slice(0, 10);

        // Action Center: convert alerts + KPI gaps into execution playbooks.
        const playbooks: Array<{
            id: string;
            priority: "P1" | "P2" | "P3";
            owner: string;
            module: "appointments" | "transactions" | "conversations" | "leads" | "calls" | "gsc" | "ga" | "ads" | "overview";
            title: string;
            why: string;
            expectedImpactUsd: number;
            triggerMetric: string;
            ctaDashboard: string;
            steps: string[];
            status: "ready";
        }> = [];
        const addPlaybook = (pb: typeof playbooks[number]) => playbooks.push(pb);
        if (cancelRateNow >= 25 || noShowRateNow >= 15) {
            addPlaybook({
                id: "bookings_reliability",
                priority: "P1",
                owner: "Ops Manager",
                module: "appointments",
                title: "Stabilize booking reliability (cancel/no-show)",
                why: `Cancellation ${cancelRateNow}% and no-show ${noShowRateNow}% are above target.`,
                expectedImpactUsd: Math.round(Math.max(500, apptLostValueNow * 0.25)),
                triggerMetric: "appointmentsCancellationRate / appointmentsNoShowRate",
                ctaDashboard: "/dashboard/appointments",
                steps: [
                    "Enable 24h and 2h reminder sequence for all calendars",
                    "Require same-day reconfirmation for first-time contacts",
                    "Escalate high-risk counties with manual callback",
                ],
                status: "ready",
            });
        }
        if ((percentChange(txGrossNow, txGrossBefore) || 0) <= -10) {
            addPlaybook({
                id: "revenue_recovery",
                priority: "P1",
                owner: "Revenue Lead",
                module: "transactions",
                title: "Revenue recovery sprint",
                why: `Revenue trend is down ${Math.round((percentChange(txGrossNow, txGrossBefore) || 0) * 10) / 10}% vs previous period.`,
                expectedImpactUsd: Math.round(Math.max(1000, Math.abs(txGrossBefore - txGrossNow) * 0.4)),
                triggerMetric: "transactionsRevenueDeltaPct",
                ctaDashboard: "/dashboard/transactions",
                steps: [
                    "Prioritize follow-up on top lost-value counties",
                    "Reactivate open qualified bookings older than 7 days",
                    "Bundle high-converting treatments in targeted offers",
                ],
                status: "ready",
            });
        }
        if (qualityScore < 85) {
            addPlaybook({
                id: "data_quality_hardening",
                priority: "P2",
                owner: "CRM Admin",
                module: "overview",
                title: "Data quality hardening",
                why: `Data Quality Score is ${qualityScore}, limiting decision reliability.`,
                expectedImpactUsd: Math.round(Math.max(300, txGrossNow * 0.05)),
                triggerMetric: "dataQuality.score",
                ctaDashboard: "/dashboard",
                steps: [
                    "Enforce required state/county/city in intake forms",
                    "Backfill missing source on high-value leads first",
                    "Normalize unknown conversation channels weekly",
                ],
                status: "ready",
            });
        }
        if ((forecastVsTarget.revenueGap || 0) < 0) {
            addPlaybook({
                id: "forecast_gap_close",
                priority: "P1",
                owner: "CEO",
                module: "overview",
                title: "Close monthly revenue forecast gap",
                why: `30-day forecast is below target by ${Math.round(Math.abs(forecastVsTarget.revenueGap))} USD.`,
                expectedImpactUsd: Math.round(Math.abs(forecastVsTarget.revenueGap)),
                triggerMetric: "forecast.forecastVsTarget.revenueGap",
                ctaDashboard: "/dashboard",
                steps: [
                    "Focus team on top 3 geographies by lost value",
                    "Run fast reactivation campaign for stale open opportunities",
                    "Shift paid budget to highest lead-to-revenue sources",
                ],
                status: "ready",
            });
        }
        if (playbooks.length === 0) {
            addPlaybook({
                id: "scale_winners",
                priority: "P3",
                owner: "Growth Lead",
                module: "overview",
                title: "Scale winning geos and channels",
                why: "No critical issues detected; focus on compounding growth.",
                expectedImpactUsd: Math.round(Math.max(300, txGrossNow * 0.08)),
                triggerMetric: "northStarScore",
                ctaDashboard: "/dashboard",
                steps: [
                    "Increase effort in top-performing state cohorts",
                    "Expand best-converting source playbooks to adjacent counties",
                    "Audit weekly capacity to protect show rate while scaling",
                ],
                status: "ready",
            });
        }
        const actionCenter = {
            total: playbooks.length,
            p1: playbooks.filter((p) => p.priority === "P1").length,
            p2: playbooks.filter((p) => p.priority === "P2").length,
            p3: playbooks.filter((p) => p.priority === "P3").length,
            expectedImpactUsd: playbooks.reduce((acc, x) => acc + x.expectedImpactUsd, 0),
            playbooks,
        };

        const out = {
            ok: true,
            range: { start, end, preset, adsRange },
            prevRange: { start: prevStart, end: prevEnd },
            executive: {
                leadsNow,
                leadsBefore,
                leadsDeltaPct: percentChange(leadsNow, leadsBefore),
                callsNow,
                callsBefore,
                callsDeltaPct: percentChange(callsNow, callsBefore),
                conversationsNow: convNow,
                conversationsBefore: convBefore,
                conversationsDeltaPct: percentChange(convNow, convBefore),
                transactionsNow: txNow,
                transactionsBefore: txBefore,
                transactionsDeltaPct: percentChange(txNow, txBefore),
                transactionsRevenueNow: txGrossNow,
                transactionsRevenueBefore: txGrossBefore,
                transactionsRevenueDeltaPct: percentChange(txGrossNow, txGrossBefore),
                transactionsAvgLtvNow: txLtvNow,
                appointmentsNow: apptNow,
                appointmentsBefore: apptBefore,
                appointmentsDeltaPct: percentChange(apptNow, apptBefore),
                appointmentsLostNow: apptLostNow,
                appointmentsLostBefore: apptLostBefore,
                appointmentsLostDeltaPct: percentChange(apptLostNow, apptLostBefore),
                appointmentsLostValueNow: apptLostValueNow,
                appointmentsLostValueBefore: apptLostValueBefore,
                appointmentsLostValueDeltaPct: percentChange(apptLostValueNow, apptLostValueBefore),
                leadToCall,
                leadToCallDeltaPct:
                    leadToCall !== null && leadToCallPrev !== null
                        ? percentChange(leadToCall, leadToCallPrev)
                        : null,
                searchImpressionsNow,
                searchImpressionsBefore,
                searchImpressionsDeltaPct,
                searchClicksNow,
                gscClicks: n(gscTotals.clicks),
                gscImpressions: n(gscTotals.impressions),
                gaSessions: n(gaSummary.sessions),
                gaUsers: n(gaSummary.users),
                gaConversions: n(gaSummary.conversions),
                adsCost: n(adsSummary.cost),
                adsConversions: n(adsSummary.conversions),
                adsConversionValue: n(adsSummary.conversionValue),
            },
            businessScore: {
                current: currentBusinessScore,
                previous: prevBusinessScore,
                deltaPct: percentChange(currentBusinessScore, prevBusinessScore),
                grade:
                    currentBusinessScore >= 80
                        ? "A"
                        : currentBusinessScore >= 70
                            ? "B"
                            : currentBusinessScore >= 60
                                ? "C"
                                : currentBusinessScore >= 50
                                    ? "D"
                                    : "F",
                granularity,
                components: currentComponents,
                trend,
            },
            northStar: {
                score: currentBusinessScore,
                previous: prevBusinessScore,
                deltaPct: percentChange(currentBusinessScore, prevBusinessScore),
                grade:
                    currentBusinessScore >= 80
                        ? "A"
                        : currentBusinessScore >= 70
                            ? "B"
                            : currentBusinessScore >= 60
                                ? "C"
                                : currentBusinessScore >= 50
                                    ? "D"
                                    : "F",
                status:
                    currentBusinessScore >= 80
                        ? "strong"
                        : currentBusinessScore >= 60
                            ? "mixed"
                            : "critical",
                components: currentComponents,
            },
            funnel,
            forecast: {
                rangeDays,
                currentPeriod: {
                    leads: leadsNow,
                    appointments: apptNow,
                    revenue: Math.round(txGrossNow * 100) / 100,
                },
                dailyPace: {
                    leads: Math.round(dailyLeads * 100) / 100,
                    appointments: Math.round(dailyAppointments * 100) / 100,
                    revenue: Math.round(dailyRevenue * 100) / 100,
                },
                forecast30,
                targetMonthly,
                targetForRange,
                forecastVsTarget,
            },
            geoBusinessScore: {
                states: geoScoreStates.slice(0, 12),
                laggingStates: [...geoScoreStates].sort((a, b) => a.score - b.score).slice(0, 5),
            },
            pipelineSla: {
                leadResponse: {
                    trackedLeads: leadCreatedByContact.size,
                    withTouch: responseMinutes.length,
                    noTouchYet,
                    within15m,
                    within60m,
                    breached60m,
                    medianMinutes: Math.round(percentile(responseMinutes, 50) * 10) / 10,
                    p90Minutes: Math.round(percentile(responseMinutes, 90) * 10) / 10,
                    sla15Rate: Math.round((within15m / Math.max(1, responseMinutes.length)) * 100),
                    sla60Rate: Math.round((within60m / Math.max(1, responseMinutes.length)) * 100),
                },
                lostOpenAging: {
                    totalOpen: openLostRows.length,
                    avgDays: Math.round((openAgingDays.reduce((a, x) => a + x, 0) / Math.max(1, openAgingDays.length)) * 10) / 10,
                    p90Days: Math.round(percentile(openAgingDays, 90) * 10) / 10,
                    over7d: openOver7d,
                    over14d: openOver14d,
                },
            },
            dataQuality: {
                score: qualityScore,
                unknownMapping: {
                    contactsStateUnknown: unknownStateContacts,
                    conversationsStateUnknown: unknownStateConversations,
                    appointmentsStateUnknown: unknownStateAppointments,
                    transactionsStateUnknown: unknownStateTransactions,
                    lostCountyUnknown: unknownCountyLost,
                    lostCityUnknown: unknownCityLost,
                },
                missingCritical: {
                    contactsMissingPhone: missingPhone,
                    contactsMissingEmail: missingEmail,
                    contactsMissingSource: missingSource,
                    conversationsUnknownChannel: unknownChannelConv,
                },
                totals: {
                    contacts: contactsRows.length,
                    conversations: convRows.length,
                    appointments: apptRows.length,
                    transactions: txRows.length,
                    lostBookings: lostRows.length,
                },
            },
            cohorts: {
                activeContacts: activeContacts.size,
                repeatContacts,
                repeatBuyers,
                rebookingRate30d: rebooking30,
                rebookingRate60d: rebooking60,
                rebookingRate90d: rebooking90,
                rows: cohortRows,
            },
            attribution: {
                topSources: attributionTopSources,
            },
            actionCenter,
            topOpportunitiesGeo: {
                states: topGeo(geoState, 10),
                counties: topGeo(geoCounty, 10),
                cities: topGeo(geoCity, 10),
            },
            alerts: {
                total: alerts.length,
                critical: alerts.filter((a) => a.severity === "critical").length,
                warning: alerts.filter((a) => a.severity === "warning").length,
                info: alerts.filter((a) => a.severity === "info").length,
                rows: alerts,
            },
            modules: {
                calls: {
                    ok: callsCur.ok,
                    total: callsNow,
                    prevTotal: callsBefore,
                    deltaPct: percentChange(callsNow, callsBefore),
                    error: callsCur.ok ? null : s(callsCur.data.error || `HTTP ${callsCur.status}`),
                },
                contacts: {
                    ok: contactsCur.ok,
                    total: leadsNow,
                    prevTotal: leadsBefore,
                    deltaPct: percentChange(leadsNow, leadsBefore),
                    contactableRate: n((contactsCur.data.kpis as JsonObject)?.phoneRate) || 0,
                    emailRate: n((contactsCur.data.kpis as JsonObject)?.emailRate) || 0,
                    inferredFromOpportunity: n((contactsCur.data.kpis as JsonObject)?.inferredFromOpportunity) || 0,
                    error: contactsCur.ok ? null : s(contactsCur.data.error || `HTTP ${contactsCur.status}`),
                },
                conversations: {
                    ok: conversationsCur.ok,
                    total: convNow,
                    prevTotal: convBefore,
                    deltaPct: percentChange(convNow, convBefore),
                    mappedStateRate: n((conversationsCur.data.kpis as JsonObject)?.stateRate) || 0,
                    topChannel:
                        Object.entries(
                            ((conversationsCur.data.byChannel as JsonObject) || {}) as Record<string, unknown>,
                        ).sort((a, b) => n(b[1]) - n(a[1]))[0]?.[0] || "unknown",
                    error: conversationsCur.ok
                        ? null
                        : s(conversationsCur.data.error || `HTTP ${conversationsCur.status}`),
                },
                transactions: {
                    ok: transactionsCur.ok,
                    total: txNow,
                    prevTotal: txBefore,
                    deltaPct: percentChange(txNow, txBefore),
                    grossAmount: txGrossNow,
                    prevGrossAmount: txGrossBefore,
                    revenueDeltaPct: percentChange(txGrossNow, txGrossBefore),
                    avgLifetimeOrderValue: txLtvNow,
                    mappedStateRate: n((transactionsCur.data.kpis as JsonObject)?.stateRate) || 0,
                    error: transactionsCur.ok
                        ? null
                        : s(transactionsCur.data.error || `HTTP ${transactionsCur.status}`),
                },
                appointments: {
                    ok: appointmentsCur.ok,
                    total: apptNow,
                    prevTotal: apptBefore,
                    deltaPct: percentChange(apptNow, apptBefore),
                    showRate: n((appointmentsCur.data.kpis as JsonObject)?.showRate) || 0,
                    noShowRate: n((appointmentsCur.data.kpis as JsonObject)?.noShowRate) || 0,
                    cancellationRate: n((appointmentsCur.data.kpis as JsonObject)?.cancellationRate) || 0,
                    mappedStateRate: n((appointmentsCur.data.kpis as JsonObject)?.stateRate) || 0,
                    lostQualified: apptLostNow,
                    lostQualifiedPrev: apptLostBefore,
                    lostQualifiedDeltaPct: percentChange(apptLostNow, apptLostBefore),
                    potentialLostValue: apptLostValueNow,
                    potentialLostValuePrev: apptLostValueBefore,
                    potentialLostValueDeltaPct: percentChange(apptLostValueNow, apptLostValueBefore),
                    error: appointmentsCur.ok
                        ? null
                        : s(appointmentsCur.data.error || `HTTP ${appointmentsCur.status}`),
                },
                gsc: {
                    ok: gscAgg.ok,
                    totals: gscTotals,
                    deltas: gscDeltas,
                    error: gscAgg.ok ? null : s(gscAgg.data.error || `HTTP ${gscAgg.status}`),
                },
                ga: {
                    ok: gaJoin.ok,
                    summaryOverall: gaSummary,
                    compare: gaCompare,
                    error: gaJoin.ok ? null : s(gaJoin.data.error || `HTTP ${gaJoin.status}`),
                },
                ads: {
                    ok: adsJoin.ok,
                    summary: adsSummary,
                    error: adsJoin.ok ? null : s(adsJoin.data.error || `HTTP ${adsJoin.status}`),
                },
                searchPerformance: {
                    ok: searchJoin.ok,
                    totals: {
                        clicks: searchClicksNow,
                        impressions: searchImpressionsNow,
                    },
                    deltas: {
                        clicksPct: searchClicksDeltaPct,
                        impressionsPct: searchImpressionsDeltaPct,
                    },
                    error: searchJoin.ok ? null : s(searchJoin.data.error || `HTTP ${searchJoin.status}`),
                },
            },
        };

        return NextResponse.json(out);
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "overview failed" },
            { status: 500 },
        );
    }
}
