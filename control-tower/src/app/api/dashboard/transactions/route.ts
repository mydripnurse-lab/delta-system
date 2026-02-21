import { NextResponse } from "next/server";
import { getAgencyAccessTokenOrThrow, getEffectiveLocationIdOrThrow, ghlFetchJson } from "@/lib/ghlHttp";
import { inferStateFromText, normalizeStateName, norm } from "@/lib/ghlState";
import { loadDashboardSnapshot, saveDashboardSnapshot } from "@/lib/dashboardSnapshots";
import { readDashboardKpiCache, writeDashboardKpiCache } from "@/lib/dashboardKpiCache";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";

export const runtime = "nodejs";
export const maxDuration = 60;

type TxRow = {
    id: string;
    contactId: string;
    customerName: string;
    amount: number;
    amountRefunded: number;
    currency: string;
    status: string;
    paymentMethod: string;
    source: string;
    createdAt: string;
    __createdMs: number | null;
    state: string;
    city: string;
    county: string;
    stateFrom: "transaction" | "transaction.source" | "contact.state" | "contact.custom_field" | "unknown";
    liveMode?: boolean | null;
    contactLifetimeNet?: number;
    contactLifetimeOrders?: number;
};

type ApiResponse = {
    ok: boolean;
    range?: { start: string; end: string };
    total?: number;
    kpis?: {
        totalTransactions: number;
        successfulTransactions: number;
        successfulLiveModeTransactions: number;
        nonRevenueTransactions: number;
        grossAmount: number;
        avgTicket: number;
        refundedTransactions: number;
        refundedAmount: number;
        netAmount: number;
        withState: number;
        stateRate: number;
        inferredFromContact: number;
        uniqueCustomers: number;
        avgOrdersPerCustomer: number;
        repeatCustomerRate: number;
        avgLifetimeOrderValue: number;
    };
    byStateCount?: Record<string, number>;
    byStateAmount?: Record<string, number>;
    byCityCount?: Record<string, number>;
    byCityAmount?: Record<string, number>;
    byCountyCount?: Record<string, number>;
    byCountyAmount?: Record<string, number>;
    rows?: TxRow[];
    cache?: {
        source: "memory" | "snapshot" | "ghl_refresh" | "db_range_cache";
        snapshotUpdatedAt?: string;
        snapshotCoverage?: { newestCreatedAt: string; oldestCreatedAt: string };
        fetchedPages?: number;
        hitPageCap?: boolean;
        snapshotComplete?: boolean;
        usedIncremental?: boolean;
        refreshReason?: string;
    };
    debug?: Record<string, unknown>;
    error?: string;
};

type TxSnapshot = {
    version: 1;
    locationId: string;
    updatedAtMs: number;
    newestCreatedAt: string;
    oldestCreatedAt: string;
    complete?: boolean;
    rows: TxRow[];
};

type GhlCtx = { tenantId?: string; integrationKey?: string };

function ghlCtxOpts(ctx?: GhlCtx) {
    const tenantId = norm(ctx?.tenantId);
    if (!tenantId) return {};
    return { tenantId, integrationKey: norm(ctx?.integrationKey) || "owner" };
}

type CacheEntry = {
    atMs: number;
    ttlMs: number;
    value: ApiResponse;
};

const RANGE_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 45_000;
const MAX_PAGES = Math.max(80, Number(process.env.TRANSACTIONS_MAX_PAGES || 800));
const PAGE_LIMIT = 100;
const PAGE_DELAY_MS = Math.max(0, Number(process.env.TRANSACTIONS_PAGE_DELAY_MS || 40));
const RETRY_BASE_MS = 1200;
const MAX_RETRIES_429 = 5;
const SNAPSHOT_TTL_MS = Number(process.env.TRANSACTIONS_SNAPSHOT_TTL_SEC || 900) * 1000;
const SNAPSHOT_MAX_NEW_PAGES = Math.max(3, Number(process.env.TRANSACTIONS_INCREMENTAL_MAX_PAGES || 12));
const SNAPSHOT_OVERLAP_MS = Number(process.env.TRANSACTIONS_INCREMENTAL_OVERLAP_MIN || 15) * 60 * 1000;
const CONTACT_GEO_CONCURRENCY = Math.max(2, Number(process.env.TRANSACTIONS_CONTACT_GEO_CONCURRENCY || 8));
const GEO_DIRECTORY_TTL_MS = Number(process.env.TRANSACTIONS_GEO_DIRECTORY_TTL_SEC || 900) * 1000;

type GeoDirectoryCache = {
    atMs: number;
    cityStateToCounty: Map<string, string>;
    cityTokens: Array<{ token: string; value: string }>;
    countyTokens: Array<{ token: string; value: string }>;
};

const GEO_DIRECTORY_CACHE_BY_TENANT = new Map<string, GeoDirectoryCache>();

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readTxSnapshot(tenantId: string, locationId: string): Promise<TxSnapshot | null> {
    const snap = await loadDashboardSnapshot(tenantId, "transactions", locationId);
    const parsed = (snap?.payload || null) as TxSnapshot | null;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    if (String(parsed.locationId || "") !== String(locationId || "")) return null;
    return parsed;
}

async function writeTxSnapshot(tenantId: string, snapshot: TxSnapshot) {
    await saveDashboardSnapshot(tenantId, "transactions", snapshot as unknown as Record<string, unknown>, {
        snapshotKey: snapshot.locationId,
        source: "dashboard_transactions_sync",
    });
}

function rowsCoverage(rows: TxRow[]) {
    let newest = 0;
    let oldest = Number.POSITIVE_INFINITY;
    for (const r of rows) {
        const ms = Number(r.__createdMs ?? NaN);
        if (!Number.isFinite(ms)) continue;
        if (ms > newest) newest = ms;
        if (ms < oldest) oldest = ms;
    }
    return {
        newestMs: newest || 0,
        oldestMs: Number.isFinite(oldest) ? oldest : 0,
        newestIso: newest ? new Date(newest).toISOString() : "",
        oldestIso: Number.isFinite(oldest) && oldest > 0 ? new Date(oldest).toISOString() : "",
    };
}

function is429(err: any) {
    return Number(err?.status || 0) === 429 || String(err?.message || "").includes("(429)");
}

function retryAfterMs(err: any) {
    const retryAfterRaw =
        err?.data?.headers?.["retry-after"] ||
        err?.data?.headers?.["Retry-After"] ||
        err?.data?.retryAfter ||
        err?.data?.retry_after;
    const asNum = Number(retryAfterRaw);
    if (Number.isFinite(asNum) && asNum > 0) return asNum * 1000;
    return null;
}

async function with429Retry<T>(fn: () => Promise<T>) {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
        try {
            return await fn();
        } catch (e: any) {
            lastErr = e;
            if (!is429(e) || attempt === MAX_RETRIES_429) break;
            const hinted = retryAfterMs(e);
            const exp = Math.round(RETRY_BASE_MS * Math.pow(1.6, attempt));
            const jitter = Math.floor(Math.random() * 450);
            await sleep(Math.max(hinted || 0, exp + jitter));
        }
    }
    throw lastErr;
}

function toMs(iso: string) {
    const d = new Date(iso);
    const t = d.getTime();
    return Number.isFinite(t) ? t : NaN;
}

function dateMsFromUnknown(v: unknown) {
    if (typeof v === "number" && Number.isFinite(v)) {
        if (v > 1_000_000_000_000) return v;
        if (v > 1_000_000_000) return v * 1000;
        return NaN;
    }
    const s = norm(v);
    if (!s) return NaN;
    const asNum = Number(s);
    if (Number.isFinite(asNum)) {
        if (asNum > 1_000_000_000_000) return asNum;
        if (asNum > 1_000_000_000) return asNum * 1000;
    }
    const d = new Date(s);
    const t = d.getTime();
    return Number.isFinite(t) ? t : NaN;
}

function pct(n: number, d: number) {
    if (!d) return 0;
    return Math.round((n / d) * 100);
}

function cacheKey(start: string, end: string, tenantId: string, integrationKey: string) {
    return `${tenantId}__${integrationKey}__${start}__${end}`;
}

function getCache(start: string, end: string, tenantId: string, integrationKey: string) {
    const k = cacheKey(start, end, tenantId, integrationKey);
    const hit = RANGE_CACHE.get(k);
    if (!hit) return null;
    if (Date.now() - hit.atMs > hit.ttlMs) {
        RANGE_CACHE.delete(k);
        return null;
    }
    return hit.value;
}

function setCache(start: string, end: string, tenantId: string, integrationKey: string, value: ApiResponse) {
    const k = cacheKey(start, end, tenantId, integrationKey);
    RANGE_CACHE.set(k, { atMs: Date.now(), ttlMs: CACHE_TTL_MS, value });
}

function pickCreatedIso(x: any) {
    const cands = [
        x.createdAt,
        x.created_at,
        x.dateAdded,
        x.date_added,
        x.updatedAt,
        x.updated_at,
        x.transactionDate,
        x.transaction_date,
        x.timestamp,
        x.time,
    ];
    for (const c of cands) {
        const ms = dateMsFromUnknown(c);
        if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
    return "";
}

function toNum(v: unknown) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function normToken(v: unknown) {
    return norm(v)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function cityStateKey(city: string, state: string) {
    const c = normToken(city);
    const s0 = normToken(normalizeStateName(state));
    return c && s0 ? `${s0}__${c}` : "";
}

function pickHeaderIndex(headers: string[], candidates: string[]) {
    const normalized = headers.map((h) => normToken(h));
    for (const c of candidates) {
        const idx = normalized.indexOf(normToken(c));
        if (idx >= 0) return idx;
    }
    return -1;
}

async function loadGeoDirectory(tenantId: string): Promise<GeoDirectoryCache | null> {
    const cacheKey = norm(tenantId);
    if (!cacheKey) return null;
    const hit = GEO_DIRECTORY_CACHE_BY_TENANT.get(cacheKey);
    if (hit && Date.now() - hit.atMs <= GEO_DIRECTORY_TTL_MS) return hit;

    try {
        const cfg = await getTenantSheetConfig(cacheKey);
        const [cities, counties] = await Promise.all([
            loadTenantSheetTabIndex({
                tenantId: cacheKey,
                spreadsheetId: cfg.spreadsheetId,
                sheetName: cfg.cityTab,
                range: "A:AZ",
            }).catch(() => null),
            loadTenantSheetTabIndex({
                tenantId: cacheKey,
                spreadsheetId: cfg.spreadsheetId,
                sheetName: cfg.countyTab,
                range: "A:AZ",
            }).catch(() => null),
        ]);

        const cityStateToCounty = new Map<string, string>();
        const cityTokens = new Map<string, string>();
        const countyTokens = new Map<string, string>();

        if (cities) {
            const iState = pickHeaderIndex(cities.headers || [], ["State"]);
            const iCity = pickHeaderIndex(cities.headers || [], ["City"]);
            const iCounty = pickHeaderIndex(cities.headers || [], ["County"]);
            for (const row of cities.rows || []) {
                const state = normalizeStateName(row?.[iState]);
                const city = norm(row?.[iCity]);
                const county = norm(row?.[iCounty]);
                const k = cityStateKey(city, state);
                if (k && county) cityStateToCounty.set(k, county);
                const cityTok = normToken(city);
                if (cityTok && city) cityTokens.set(cityTok, city);
                const countyTok = normToken(county);
                if (countyTok && county) countyTokens.set(countyTok, county);
            }
        }

        if (counties) {
            const iState = pickHeaderIndex(counties.headers || [], ["State"]);
            const iCounty = pickHeaderIndex(counties.headers || [], ["County"]);
            for (const row of counties.rows || []) {
                const state = normalizeStateName(row?.[iState]);
                const county = norm(row?.[iCounty]);
                const countyTok = normToken(county);
                if (countyTok && county) countyTokens.set(countyTok, county);
                // Keep a pseudo key for state-level county match.
                if (state && county) cityStateToCounty.set(`${normToken(state)}__${countyTok}`, county);
            }
        }

        const out: GeoDirectoryCache = {
            atMs: Date.now(),
            cityStateToCounty,
            cityTokens: Array.from(cityTokens.entries()).map(([token, value]) => ({ token, value })),
            countyTokens: Array.from(countyTokens.entries()).map(([token, value]) => ({ token, value })),
        };
        GEO_DIRECTORY_CACHE_BY_TENANT.set(cacheKey, out);
        return out;
    } catch {
        return null;
    }
}

function scalarFromUnknown(v: any): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v !== "object") return "";
    const cands = [
        v.method,
        v.type,
        v.name,
        v.value,
        v.displayName,
        v.provider,
        v.channel,
        v.status,
        v.code,
    ];
    for (const c of cands) {
        const s = scalarFromUnknown(c);
        if (s) return s;
    }
    return "";
}

function firstNonEmpty(...values: unknown[]) {
    for (const v of values) {
        const s0 = norm(v);
        if (s0) return s0;
    }
    return "";
}

function valueFromCustomFields(raw: unknown, kind: "state" | "city" | "county") {
    const list = Array.isArray(raw) ? raw : [];
    for (const field of list) {
        if (!field || typeof field !== "object") continue;
        const key = norm((field as any).key || (field as any).name || (field as any).fieldKey || (field as any).id).toLowerCase();
        if (!key) continue;
        if (kind === "state" && !key.includes("state")) continue;
        if (kind === "city" && !key.includes("city")) continue;
        if (kind === "county" && !key.includes("county")) continue;
        const val = firstNonEmpty((field as any).value, (field as any).fieldValue, (field as any).text, (field as any).label);
        if (val) return val;
    }
    return "";
}

function pickAmount(x: any) {
    const raw = toNum(
        x.amount ??
            x.total ??
            x.totalAmount ??
            x.total_amount ??
            x.value ??
            x.transactionAmount ??
            x.transaction_amount ??
            0,
    );
    // Keep as-is to avoid wrong assumptions; just clamp not-a-number.
    return Number(raw.toFixed(2));
}

function pickAmountRefunded(x: any) {
    const raw = toNum(x.amountRefunded ?? x.amount_refunded ?? x.refundedAmount ?? x.refunded_amount ?? 0);
    return Number(raw.toFixed(2));
}

function pickStateFromTx(x: any) {
    const s0 = normalizeStateName(
        norm(
            x.state ||
                x.billingState ||
                x.billing_state ||
                x.billingAddress?.state ||
                x.address?.state ||
                x.customer?.state ||
                x.customer?.address?.state,
        ),
    );
    return s0 || "";
}

function pickCityFromTx(x: any) {
    return norm(
        x.city ||
            x.billingCity ||
            x.billing_city ||
            x.billingAddress?.city ||
            x.address?.city ||
            x.customer?.city ||
            x.customer?.address?.city,
    );
}

function pickCountyFromTx(x: any) {
    return norm(
        x.county ||
            x.billingCounty ||
            x.billing_county ||
            x.billingAddress?.county ||
            x.address?.county ||
            x.customer?.county ||
            x.customer?.address?.county,
    );
}

function pickContactId(x: any) {
    return norm(
        x.contactId ||
            x.contact_id ||
            x.customerId ||
            x.customer_id ||
            x.customer?.contactId ||
            x.customer?.id,
    );
}

function pickTxId(x: any) {
    return norm(
        x.id ||
            x.transactionId ||
            x.transaction_id ||
            x.paymentId ||
            x.payment_id ||
            x.referenceId ||
            x.reference_id,
    );
}

function pickStatus(x: any) {
    return norm(
        scalarFromUnknown(x.status) ||
            scalarFromUnknown(x.paymentStatus) ||
            scalarFromUnknown(x.payment_status) ||
            "unknown",
    ).toLowerCase();
}

function pickMethod(x: any) {
    const raw = norm(
        scalarFromUnknown(x.paymentMethod) ||
            scalarFromUnknown(x.payment_method) ||
            scalarFromUnknown(x.method) ||
            scalarFromUnknown(x.type) ||
            scalarFromUnknown(x.source) ||
            scalarFromUnknown(x.provider) ||
            scalarFromUnknown(x.gateway),
    ).toLowerCase();
    if (!raw) return "unknown";
    if (raw.includes("card")) return "card";
    if (raw.includes("ach") || raw.includes("bank")) return "bank";
    if (raw.includes("cash")) return "cash";
    if (raw.includes("apple")) return "apple_pay";
    if (raw.includes("google")) return "google_pay";
    return raw;
}

function pickLiveMode(x: any): boolean | null {
    const raw = x?.liveMode ?? x?.live_mode ?? x?.livemode ?? x?.mode;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw === 1 ? true : raw === 0 ? false : null;
    const s0 = norm(raw).toLowerCase();
    if (!s0) return null;
    if (s0 === "true" || s0 === "1" || s0 === "live") return true;
    if (s0 === "false" || s0 === "0" || s0 === "test" || s0 === "sandbox") return false;
    return null;
}

function isRefundLike(statusRaw: string) {
    const s = norm(statusRaw).toLowerCase();
    return s.includes("refund") || s.includes("chargeback") || s.includes("reversal") || s.includes("reversed");
}

function isSucceededRevenueStatus(statusRaw: string) {
    const s = norm(statusRaw).toLowerCase();
    if (!s) return false;
    if (isRefundLike(s)) return false;
    if (s.includes("failed") || s.includes("declined") || s.includes("canceled") || s.includes("void")) return false;
    if (s.includes("pending") || s.includes("processing") || s.includes("in_progress")) return false;
    return (
        s.includes("succeeded") ||
        s.includes("success") ||
        s.includes("paid") ||
        s.includes("completed") ||
        s.includes("captured") ||
        s.includes("settled")
    );
}

function extractTransactionsArray(res: unknown) {
    const x = res as any;
    if (Array.isArray(x?.transactions)) return x.transactions;
    if (Array.isArray(x?.data?.transactions)) return x.data.transactions;
    if (Array.isArray(x?.items)) return x.items;
    if (Array.isArray(x?.data?.items)) return x.data.items;
    if (Array.isArray(x?.data)) return x.data;
    if (Array.isArray(x)) return x;
    return [];
}

function pageMeta(res: any) {
    const root = res || {};
    const data = root?.data || {};
    const pagination = root?.pagination || data?.pagination || {};
    const meta = root?.meta || data?.meta || {};

    const hasMoreRaw =
        pagination?.hasMore ??
        pagination?.has_more ??
        meta?.hasMore ??
        meta?.has_more ??
        root?.hasMore ??
        root?.has_more;

    const nextPageRaw =
        pagination?.nextPage ??
        pagination?.next_page ??
        meta?.nextPage ??
        meta?.next_page ??
        root?.nextPage ??
        root?.next_page;

    const nextCursorRaw =
        pagination?.nextCursor ??
        pagination?.next_cursor ??
        data?.nextCursor ??
        data?.next_cursor ??
        root?.nextCursor ??
        root?.next_cursor ??
        "";

    const totalCountRaw =
        root?.totalCount ??
        root?.total_count ??
        data?.totalCount ??
        data?.total_count ??
        pagination?.totalCount ??
        pagination?.total_count ??
        meta?.totalCount ??
        meta?.total_count ??
        0;

    let hasMore: boolean | null = null;
    if (typeof hasMoreRaw === "boolean") hasMore = hasMoreRaw;
    else if (norm(hasMoreRaw)) hasMore = norm(hasMoreRaw).toLowerCase() === "true";
    const nextPage = Number(nextPageRaw);
    const nextCursor = norm(nextCursorRaw);
    const totalCount = Number(totalCountRaw);
    return {
        hasMore,
        nextPage: Number.isFinite(nextPage) ? nextPage : 0,
        nextCursor,
        totalCount: Number.isFinite(totalCount) && totalCount > 0 ? Math.floor(totalCount) : 0,
    };
}

function toRow(x: any): TxRow {
    const createdAt = pickCreatedIso(x);
    const createdMs = Number.isFinite(new Date(createdAt).getTime()) ? new Date(createdAt).getTime() : null;
    const state = pickStateFromTx(x);
    return {
        id: pickTxId(x),
        contactId: pickContactId(x),
        customerName: norm(
            x.customerName ||
                x.customer?.name ||
                x.name ||
                `${norm(x.customer?.firstName)} ${norm(x.customer?.lastName)}`.trim(),
        ),
        amount: pickAmount(x),
        amountRefunded: pickAmountRefunded(x),
        currency: norm(x.currency || x.currencyCode || "USD").toUpperCase() || "USD",
        status: pickStatus(x),
        paymentMethod: pickMethod(x),
        source: norm(x.source || x.provider || x.gateway || ""),
        createdAt,
        __createdMs: createdMs,
        state: state || "",
        city: pickCityFromTx(x),
        county: pickCountyFromTx(x),
        stateFrom: state ? "transaction" : "unknown",
        liveMode: pickLiveMode(x),
    };
}

function toYmd(iso: string) {
    const t = toMs(iso);
    if (!Number.isFinite(t)) return "";
    return new Date(t).toISOString().slice(0, 10);
}

async function fetchTransactions(
    locationId: string,
    startIso: string,
    endIso: string,
    debug = false,
    opts?: { stopWhenOlderThanMs?: number; maxPages?: number },
    ctx?: GhlCtx,
) {
    const startMs = toMs(startIso);
    const endMs = toMs(endIso);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        throw new Error(`Invalid range. start=${startIso} end=${endIso}`);
    }

    const agencyToken = await getAgencyAccessTokenOrThrow(ctx).catch(() => "");
    const stopWhenOlderThanMs = Number(opts?.stopWhenOlderThanMs || 0);
    const maxPages = Math.max(1, Number(opts?.maxPages || MAX_PAGES));

    const shouldStopByOldest = (rows: any[]) => {
        if (!stopWhenOlderThanMs) return false;
        let oldest = Number.POSITIVE_INFINITY;
        for (const x of rows || []) {
            const iso = pickCreatedIso(x);
            const ms = dateMsFromUnknown(iso);
            if (Number.isFinite(ms) && ms < oldest) oldest = ms;
        }
        return Number.isFinite(oldest) && oldest <= stopWhenOlderThanMs;
    };

    const runOffsetVariant = async (opts: {
        includeLocationId?: boolean;
        useAlt?: boolean;
        authToken?: string;
    }) => {
        const all: any[] = [];
        const seenPageSigs = new Set<string>();
        let pagesFetched = 0;
        let hitPageCap = false;
        let expectedTotal = 0;
        const startAt = toYmd(startIso);
        const endAt = toYmd(endIso);
        for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
            const offset = pageIdx * PAGE_LIMIT;
            const qs = new URLSearchParams();
            qs.set("limit", String(PAGE_LIMIT));
            qs.set("offset", String(offset));
            if (startAt) qs.set("startAt", startAt);
            if (endAt) qs.set("endAt", endAt);
            // We only report real revenue from live mode; fetch scope aligned to live.
            qs.set("paymentMode", "live");
            if (opts.includeLocationId) qs.set("locationId", locationId);
            if (opts.useAlt) {
                qs.set("altId", locationId);
                qs.set("altType", "location");
            }
            const res = await with429Retry(() =>
                ghlFetchJson(`/payments/transactions?${qs.toString()}`, {
                    method: "GET",
                    authToken: opts.authToken,
                    ...ghlCtxOpts(ctx),
                }),
            );
            const rows = extractTransactionsArray(res);
            pagesFetched++;
            const meta = pageMeta(res);
            if (!expectedTotal && meta.totalCount > 0) expectedTotal = meta.totalCount;
            if (!rows.length) break;
            all.push(...rows);
            if (shouldStopByOldest(rows)) break;
            if (expectedTotal > 0 && all.length >= expectedTotal) break;

            const sig = `${rows.length}|${norm((rows[0] || {})?._id || (rows[0] || {})?.id)}|${norm(
                (rows[rows.length - 1] || {})?._id || (rows[rows.length - 1] || {})?.id,
            )}|${offset}`;
            if (seenPageSigs.has(sig)) break;
            seenPageSigs.add(sig);

            if (pageIdx === maxPages - 1) hitPageCap = true;
            await sleep(PAGE_DELAY_MS);
            if (rows.length < PAGE_LIMIT && expectedTotal <= 0) break;
        }
        return { rows: all, pagesFetched, hitPageCap };
    };

    const attempts = [
        // Documented contract: altId + altType + paymentMode + startAt/endAt + limit/offset
        async () => runOffsetVariant({ includeLocationId: false, useAlt: true }),
        // alt + locationId together (some accounts require explicit locationId)
        async () => runOffsetVariant({ includeLocationId: true, useAlt: true }),
        // locationId + offset pagination
        async () => runOffsetVariant({ includeLocationId: true, useAlt: false }),
        // Agency token fallbacks with documented offset pagination
        async () => {
            if (!agencyToken) throw new Error("Agency token unavailable");
            return runOffsetVariant({ includeLocationId: false, useAlt: true, authToken: agencyToken });
        },
        async () => {
            if (!agencyToken) throw new Error("Agency token unavailable");
            return runOffsetVariant({ includeLocationId: true, useAlt: true, authToken: agencyToken });
        },
        // Documented endpoint (location token + explicit locationId)
        async () => {
            const all: any[] = [];
            let cursor = "";
            const seenPageSigs = new Set<string>();
            let pagesFetched = 0;
            let hitPageCap = false;
            let expectedTotal = 0;
            for (let page = 1; page <= maxPages; page++) {
                const qs = new URLSearchParams();
                qs.set("locationId", locationId);
                qs.set("page", String(page));
                qs.set("limit", String(PAGE_LIMIT));
                if (cursor) qs.set("cursor", cursor);
                const res = await with429Retry(() =>
                    ghlFetchJson(`/payments/transactions?${qs.toString()}`, { method: "GET", ...ghlCtxOpts(ctx) }),
                );
                const rows = extractTransactionsArray(res);
                pagesFetched++;
                all.push(...rows);
                const meta = pageMeta(res);
                if (!expectedTotal && meta.totalCount > 0) expectedTotal = meta.totalCount;
                if (!rows.length) break;
                if (shouldStopByOldest(rows)) break;
                if (expectedTotal > 0 && all.length >= expectedTotal) break;

                const sig = `${rows.length}|${norm((rows[0] || {})?.id)}|${norm((rows[rows.length - 1] || {})?.id)}|${cursor}`;
                if (seenPageSigs.has(sig)) break;
                seenPageSigs.add(sig);

                if (meta.nextCursor && meta.nextCursor !== cursor) {
                    cursor = meta.nextCursor;
                } else if (meta.nextPage > page) {
                    page = meta.nextPage - 1;
                } else if (meta.hasMore === false && !meta.nextCursor && !meta.nextPage) {
                    break;
                }
                await sleep(PAGE_DELAY_MS);
                if (page === maxPages) hitPageCap = true;
            }
            return { rows: all, pagesFetched, hitPageCap };
        },
        // Same endpoint without locationId; some accounts infer from token context.
        async () => {
            const all: any[] = [];
            let cursor = "";
            const seenPageSigs = new Set<string>();
            let pagesFetched = 0;
            let hitPageCap = false;
            let expectedTotal = 0;
            for (let page = 1; page <= maxPages; page++) {
                const qs = new URLSearchParams();
                qs.set("page", String(page));
                qs.set("limit", String(PAGE_LIMIT));
                if (cursor) qs.set("cursor", cursor);
                const res = await with429Retry(() =>
                    ghlFetchJson(`/payments/transactions?${qs.toString()}`, { method: "GET", ...ghlCtxOpts(ctx) }),
                );
                const rows = extractTransactionsArray(res);
                pagesFetched++;
                all.push(...rows);
                const meta = pageMeta(res);
                if (!expectedTotal && meta.totalCount > 0) expectedTotal = meta.totalCount;
                if (!rows.length) break;
                if (shouldStopByOldest(rows)) break;
                if (expectedTotal > 0 && all.length >= expectedTotal) break;

                const sig = `${rows.length}|${norm((rows[0] || {})?.id)}|${norm((rows[rows.length - 1] || {})?.id)}|${cursor}`;
                if (seenPageSigs.has(sig)) break;
                seenPageSigs.add(sig);

                if (meta.nextCursor && meta.nextCursor !== cursor) {
                    cursor = meta.nextCursor;
                } else if (meta.nextPage > page) {
                    page = meta.nextPage - 1;
                } else if (meta.hasMore === false && !meta.nextCursor && !meta.nextPage) {
                    break;
                }
                await sleep(PAGE_DELAY_MS);
                if (page === maxPages) hitPageCap = true;
            }
            return { rows: all, pagesFetched, hitPageCap };
        },
        // Agency token fallback + explicit locationId.
        async () => {
            if (!agencyToken) throw new Error("Agency token unavailable");
            const all: any[] = [];
            let cursor = "";
            const seenPageSigs = new Set<string>();
            let pagesFetched = 0;
            let hitPageCap = false;
            let expectedTotal = 0;
            for (let page = 1; page <= maxPages; page++) {
                const qs = new URLSearchParams();
                qs.set("locationId", locationId);
                qs.set("page", String(page));
                qs.set("limit", String(PAGE_LIMIT));
                if (cursor) qs.set("cursor", cursor);
                const res = await with429Retry(() =>
                    ghlFetchJson(`/payments/transactions?${qs.toString()}`, {
                        method: "GET",
                        authToken: agencyToken,
                        ...ghlCtxOpts(ctx),
                    }),
                );
                const rows = extractTransactionsArray(res);
                pagesFetched++;
                all.push(...rows);
                const meta = pageMeta(res);
                if (!expectedTotal && meta.totalCount > 0) expectedTotal = meta.totalCount;
                if (!rows.length) break;
                if (shouldStopByOldest(rows)) break;
                if (expectedTotal > 0 && all.length >= expectedTotal) break;

                const sig = `${rows.length}|${norm((rows[0] || {})?.id)}|${norm((rows[rows.length - 1] || {})?.id)}|${cursor}`;
                if (seenPageSigs.has(sig)) break;
                seenPageSigs.add(sig);

                if (meta.nextCursor && meta.nextCursor !== cursor) {
                    cursor = meta.nextCursor;
                } else if (meta.nextPage > page) {
                    page = meta.nextPage - 1;
                } else if (meta.hasMore === false && !meta.nextCursor && !meta.nextPage) {
                    break;
                }
                await sleep(PAGE_DELAY_MS);
                if (page === maxPages) hitPageCap = true;
            }
            return { rows: all, pagesFetched, hitPageCap };
        },
        // Agency token + altId/altType fallback.
        async () => {
            if (!agencyToken) throw new Error("Agency token unavailable");
            const all: any[] = [];
            let cursor = "";
            const seenPageSigs = new Set<string>();
            let pagesFetched = 0;
            let hitPageCap = false;
            let expectedTotal = 0;
            for (let page = 1; page <= maxPages; page++) {
                const qs = new URLSearchParams();
                qs.set("altType", "location");
                qs.set("altId", locationId);
                qs.set("page", String(page));
                qs.set("limit", String(PAGE_LIMIT));
                if (cursor) qs.set("cursor", cursor);
                const res = await with429Retry(() =>
                    ghlFetchJson(`/payments/transactions?${qs.toString()}`, {
                        method: "GET",
                        authToken: agencyToken,
                        ...ghlCtxOpts(ctx),
                    }),
                );
                const rows = extractTransactionsArray(res);
                pagesFetched++;
                all.push(...rows);
                const meta = pageMeta(res);
                if (!expectedTotal && meta.totalCount > 0) expectedTotal = meta.totalCount;
                if (!rows.length) break;
                if (shouldStopByOldest(rows)) break;
                if (expectedTotal > 0 && all.length >= expectedTotal) break;

                const sig = `${rows.length}|${norm((rows[0] || {})?.id)}|${norm((rows[rows.length - 1] || {})?.id)}|${cursor}`;
                if (seenPageSigs.has(sig)) break;
                seenPageSigs.add(sig);

                if (meta.nextCursor && meta.nextCursor !== cursor) {
                    cursor = meta.nextCursor;
                } else if (meta.nextPage > page) {
                    page = meta.nextPage - 1;
                } else if (meta.hasMore === false && !meta.nextCursor && !meta.nextPage) {
                    break;
                }
                await sleep(PAGE_DELAY_MS);
                if (page === maxPages) hitPageCap = true;
            }
            return { rows: all, pagesFetched, hitPageCap };
        },
        // Location token + altId/altType (some accounts only paginate well with this pair)
        async () => {
            const all: any[] = [];
            let cursor = "";
            const seenPageSigs = new Set<string>();
            let pagesFetched = 0;
            let hitPageCap = false;
            let expectedTotal = 0;
            for (let page = 1; page <= maxPages; page++) {
                const qs = new URLSearchParams();
                qs.set("altType", "location");
                qs.set("altId", locationId);
                qs.set("page", String(page));
                qs.set("limit", String(PAGE_LIMIT));
                if (cursor) qs.set("cursor", cursor);
                const res = await with429Retry(() =>
                    ghlFetchJson(`/payments/transactions?${qs.toString()}`, { method: "GET", ...ghlCtxOpts(ctx) }),
                );
                const rows = extractTransactionsArray(res);
                pagesFetched++;
                all.push(...rows);
                const meta = pageMeta(res);
                if (!expectedTotal && meta.totalCount > 0) expectedTotal = meta.totalCount;
                if (!rows.length) break;
                if (shouldStopByOldest(rows)) break;
                if (expectedTotal > 0 && all.length >= expectedTotal) break;

                const sig = `${rows.length}|${norm((rows[0] || {})?.id)}|${norm((rows[rows.length - 1] || {})?.id)}|${cursor}`;
                if (seenPageSigs.has(sig)) break;
                seenPageSigs.add(sig);

                if (meta.nextCursor && meta.nextCursor !== cursor) {
                    cursor = meta.nextCursor;
                } else if (meta.nextPage > page) {
                    page = meta.nextPage - 1;
                } else if (meta.hasMore === false && !meta.nextCursor && !meta.nextPage) {
                    break;
                }
                await sleep(PAGE_DELAY_MS);
                if (page === maxPages) hitPageCap = true;
            }
            return { rows: all, pagesFetched, hitPageCap };
        },
    ];

    let lastErr: unknown = null;
    const attemptErrs: string[] = [];
    for (let i = 0; i < attempts.length; i++) {
        try {
            const fetchedRaw = await attempts[i]();
            const raw = fetchedRaw.rows;
            const mapped = raw.map(toRow);
            return {
                rawCount: raw.length,
                mappedCount: mapped.length,
                rows: mapped,
                pagesFetched: Number(fetchedRaw.pagesFetched || 0),
                hitPageCap: Boolean(fetchedRaw.hitPageCap),
                startMs,
                endMs,
                usedMaxPages: maxPages,
                stopWhenOlderThanMs,
            };
        } catch (e: unknown) {
            lastErr = e;
            attemptErrs.push(`attempt ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
            if (debug) console.log("[transactions] attempt failed", i + 1, e);
        }
    }

    throw lastErr instanceof Error
        ? new Error(
            `Unable to fetch transactions after ${attempts.length} endpoint variants for locationId=${locationId}. ${lastErr.message}. Details: ${attemptErrs.join(" | ")}`,
        )
        : new Error("Unable to fetch transactions.");
}

function inferCityFromSource(source: string, directory: GeoDirectoryCache | null) {
    if (!directory) return "";
    const src = normToken(source);
    if (!src) return "";
    let best = "";
    for (const x of directory.cityTokens) {
        if (!x.token) continue;
        const re = new RegExp(`\\b${x.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (!re.test(src)) continue;
        if (x.token.length > normToken(best).length) best = x.value;
    }
    return best;
}

function inferCountyFromSource(source: string, directory: GeoDirectoryCache | null) {
    if (!directory) return "";
    const src = normToken(source);
    if (!src) return "";
    let best = "";
    for (const x of directory.countyTokens) {
        if (!x.token) continue;
        const re = new RegExp(`\\b${x.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (!re.test(src)) continue;
        if (x.token.length > normToken(best).length) best = x.value;
    }
    return best;
}

function inferCountyFromCityState(city: string, state: string, directory: GeoDirectoryCache | null) {
    if (!directory) return "";
    const key = cityStateKey(city, state);
    if (!key) return "";
    return norm(directory.cityStateToCounty.get(key));
}

function enrichRowGeoFromSource(row: TxRow, directory: GeoDirectoryCache | null) {
    const source = norm(row.source);
    if (source && !row.state) {
        const inferredState = normalizeStateName(inferStateFromText(source));
        if (inferredState) {
            row.state = inferredState;
            row.stateFrom = "transaction.source";
        }
    }
    if (!row.city && source) {
        const inferredCity = inferCityFromSource(source, directory);
        if (inferredCity) row.city = inferredCity;
    }
    if (!row.county) {
        const byCityState = inferCountyFromCityState(row.city, row.state, directory);
        if (byCityState) row.county = byCityState;
        else if (source) {
            const bySource = inferCountyFromSource(source, directory);
            if (bySource) row.county = bySource;
        }
    }
}

async function resolveContactState(contactId: string, ctx?: GhlCtx, directory?: GeoDirectoryCache | null) {
    if (!contactId) return { state: "", city: "", county: "", from: "unknown" as const };
    try {
        const c = (await with429Retry(() =>
            ghlFetchJson(`/contacts/${encodeURIComponent(contactId)}`, { method: "GET", ...ghlCtxOpts(ctx) }),
        )) as any;
        const stateBase = normalizeStateName(
            firstNonEmpty(
                c?.state,
                c?.address?.state,
                c?.contact?.state,
                c?.contact?.address?.state,
                c?.location?.state,
                c?.billingAddress?.state,
                c?.billing_state,
            ),
        );
        const cityBase = firstNonEmpty(
            c?.city,
            c?.address?.city,
            c?.contact?.city,
            c?.contact?.address?.city,
            c?.location?.city,
            c?.billingAddress?.city,
            c?.billing_city,
        );
        const countyBase = firstNonEmpty(
            c?.county,
            c?.address?.county,
            c?.contact?.county,
            c?.contact?.address?.county,
            c?.location?.county,
            c?.billingAddress?.county,
            c?.billing_county,
        );
        if (stateBase) {
            const city0 = norm(cityBase);
            const county0 = norm(countyBase) || inferCountyFromCityState(city0, stateBase, directory || null);
            return { state: stateBase, city: city0, county: county0, from: "contact.state" as const };
        }
        const stateCf = normalizeStateName(valueFromCustomFields(c?.customFields, "state"));
        const cityCf = valueFromCustomFields(c?.customFields, "city");
        const countyCf = valueFromCustomFields(c?.customFields, "county");
        const source = firstNonEmpty(c?.source, c?.contact?.source, c?.additionalInfo?.source);
        const stateInferred = normalizeStateName(inferStateFromText(source));
        const state = stateCf || stateInferred;
        const city = norm(cityBase || cityCf || inferCityFromSource(source, directory || null));
        const county =
            norm(countyBase || countyCf) ||
            inferCountyFromCityState(city, state, directory || null) ||
            inferCountyFromSource(source, directory || null);
        if (stateCf) return { state: stateCf, city, county, from: "contact.custom_field" as const };
        if (stateInferred) return { state: stateInferred, city, county, from: "transaction.source" as const };
        if (city || county) return { state: "", city, county, from: "unknown" as const };
        return { state: "", city: "", county: "", from: "unknown" as const };
    } catch {
        return { state: "", city: "", county: "", from: "unknown" as const };
    }
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const start = url.searchParams.get("start") || "";
    const end = url.searchParams.get("end") || "";
    const bust = url.searchParams.get("bust") === "1";
    const hard = url.searchParams.get("hard") === "1";
    const debug = url.searchParams.get("debug") === "1";
    const tenantId = norm(url.searchParams.get("tenantId"));
    const integrationKey = norm(url.searchParams.get("integrationKey")) || "owner";
    if (!tenantId) {
        return NextResponse.json({ ok: false, error: "Missing tenantId" } satisfies ApiResponse, { status: 400 });
    }
    const ghlCtx: GhlCtx = { tenantId, integrationKey };

    try {
        if (!start || !end) {
            return NextResponse.json({ ok: false, error: "Missing start/end" } satisfies ApiResponse, { status: 400 });
        }

        if (!bust) {
            const dbCached = await readDashboardKpiCache({
                tenantId: tenantId,
                module: "transactions",
                integrationKey,
                start: start,
                end: end,
                preset: norm(url.searchParams.get("preset")) || "",
                compare: url.searchParams.get("compare") === "1",
            });
            if (dbCached?.payload) {
                const payload = dbCached.payload as ApiResponse;
                return NextResponse.json({
                    ...payload,
                    cache: {
                        ...(payload.cache || {}),
                        source: "db_range_cache",
                    },
                } satisfies ApiResponse);
            }

            const cached = getCache(start, end, tenantId, integrationKey);
            if (cached) {
                const cachedOut: ApiResponse = {
                    ...cached,
                    cache: {
                        ...(cached.cache || {}),
                        source: "memory",
                    },
                };
                return NextResponse.json(cachedOut);
            }
        }

        const locationId = await getEffectiveLocationIdOrThrow(ghlCtx);
        const snapshot = await readTxSnapshot(tenantId, locationId);
        const startMs = toMs(start);
        const endMs = toMs(end);
        const snapshotCov = snapshot ? rowsCoverage(snapshot.rows || []) : { newestMs: 0, oldestMs: 0, newestIso: "", oldestIso: "" };
        const needsHistoricBackfill =
            !!snapshot &&
            Number.isFinite(startMs) &&
            !!snapshotCov.oldestMs &&
            startMs < snapshotCov.oldestMs;
        const snapshotFresh = !!snapshot && Date.now() - Number(snapshot.updatedAtMs || 0) <= SNAPSHOT_TTL_MS;

        let allRowsSource: TxRow[] = [];
        let cacheSource: "memory" | "snapshot" | "ghl_refresh" = "ghl_refresh";
        let fetchedPages = 0;
        let hitPageCap = false;
        let usedIncremental = false;
        let refreshReason = "";
        let snapshotUpdatedAtIso = snapshot?.updatedAtMs ? new Date(snapshot.updatedAtMs).toISOString() : "";

        if (snapshotFresh && snapshot && !bust && !hard && !needsHistoricBackfill) {
            allRowsSource = snapshot.rows || [];
            cacheSource = "snapshot";
            refreshReason = "snapshot_fresh";
        } else {
            if (needsHistoricBackfill) {
                refreshReason = "snapshot_missing_requested_range_full_backfill";
            } else if (hard) {
                refreshReason = "hard_full_refresh";
            } else {
                refreshReason = snapshot ? "snapshot_stale_refresh" : "snapshot_missing_full_fetch";
            }
            const snapshotNewestMs = snapshot?.newestCreatedAt ? toMs(snapshot.newestCreatedAt) : 0;
            const stopWhenOlderThanMs = snapshotNewestMs
                ? Math.max(0, snapshotNewestMs - SNAPSHOT_OVERLAP_MS)
                : 0;

            const fetched = await fetchTransactions(
                locationId,
                start,
                end,
                debug,
                snapshot && !hard && !needsHistoricBackfill
                    ? {
                        stopWhenOlderThanMs,
                        maxPages: SNAPSHOT_MAX_NEW_PAGES,
                    }
                    : {
                        maxPages: MAX_PAGES,
                    },
                ghlCtx,
            );
            fetchedPages = Math.ceil((fetched.rawCount || 0) / PAGE_LIMIT);
            if (fetched.pagesFetched) fetchedPages = fetched.pagesFetched;
            hitPageCap = Boolean(fetched.hitPageCap);
            usedIncremental = !!snapshot && !needsHistoricBackfill;
            cacheSource = "ghl_refresh";

            const baseRows = snapshot?.rows || [];
            const merged = [...fetched.rows, ...baseRows];

            // Deduplicate merged rows by tx id/fallback key.
            const dedupeAll = new Map<string, TxRow>();
            for (const row of merged) {
                const key = norm(row.id) || `${norm(row.contactId)}|${norm(row.createdAt)}|${row.amount}|${norm(row.status)}`;
                if (!key) continue;
                const prev = dedupeAll.get(key);
                if (!prev) {
                    dedupeAll.set(key, row);
                    continue;
                }
                const p = Number(prev.__createdMs || 0);
                const n = Number(row.__createdMs || 0);
                if (n >= p) dedupeAll.set(key, row);
            }
            allRowsSource = Array.from(dedupeAll.values());

            const cov = rowsCoverage(allRowsSource);
            await writeTxSnapshot(tenantId, {
                version: 1,
                locationId,
                updatedAtMs: Date.now(),
                newestCreatedAt: cov.newestIso,
                oldestCreatedAt: cov.oldestIso,
                complete: !hitPageCap,
                rows: allRowsSource,
            });
            snapshotUpdatedAtIso = new Date().toISOString();
        }

        // Deduplicate source rows again defensively (handles old snapshot format/duplicates).
        const dedupe = new Map<string, TxRow>();
        for (const row of allRowsSource) {
            const key = norm(row.id) || `${norm(row.contactId)}|${norm(row.createdAt)}|${row.amount}|${norm(row.status)}`;
            if (!key) continue;
            const prev = dedupe.get(key);
            if (!prev) {
                dedupe.set(key, row);
                continue;
            }
            const p = Number(prev.__createdMs || 0);
            const n = Number(row.__createdMs || 0);
            if (n >= p) dedupe.set(key, row);
        }
        const allRows = Array.from(dedupe.values());
        const covNow = rowsCoverage(allRows);
        const rows = allRows.filter((r) => {
            const ms = Number(r.__createdMs ?? NaN);
            if (!Number.isFinite(ms)) return true;
            return ms >= startMs && ms <= endMs;
        });

        const geoDirectory = await loadGeoDirectory(tenantId);
        for (const r of rows) enrichRowGeoFromSource(r, geoDirectory);

        const stateCache = new Map<string, { state: string; city: string; county: string; from: TxRow["stateFrom"] }>();
        const missingIds = Array.from(
            new Set(
                rows
                    .filter((r) => (!r.state || !r.city || !r.county) && !!r.contactId)
                    .map((r) => norm(r.contactId))
                    .filter(Boolean),
            ),
        );
        if (missingIds.length) {
            const queue = [...missingIds];
            const workers = Array.from({ length: Math.min(CONTACT_GEO_CONCURRENCY, queue.length) }, async () => {
                while (queue.length) {
                    const cid = queue.shift();
                    if (!cid || stateCache.has(cid)) continue;
                    const resolved = await resolveContactState(cid, ghlCtx, geoDirectory);
                    stateCache.set(cid, resolved);
                }
            });
            await Promise.all(workers);
        }

        let inferredFromContact = 0;
        for (const r of rows) {
            const resolved = stateCache.get(r.contactId);
            if (resolved) {
                if (!r.state && resolved.state) {
                    r.state = normalizeStateName(resolved.state);
                    r.stateFrom = resolved.from;
                    if (resolved.from === "contact.state" || resolved.from === "contact.custom_field") inferredFromContact++;
                }
                if (!r.city && resolved.city) r.city = resolved.city;
                if (!r.county && resolved.county) r.county = resolved.county;
            }
            if (!r.county) {
                const byCityState = inferCountyFromCityState(r.city, r.state, geoDirectory);
                if (byCityState) r.county = byCityState;
            }
        }

        const byStateCount: Record<string, number> = {};
        const byStateAmount: Record<string, number> = {};
        const byCityCount: Record<string, number> = {};
        const byCityAmount: Record<string, number> = {};
        const byCountyCount: Record<string, number> = {};
        const byCountyAmount: Record<string, number> = {};
        let grossAmount = 0;
        let refundedAmount = 0;
        let refundedTransactions = 0;
        let allSucceededTransactions = 0;
        let nonRevenueTransactions = 0;
        let successfulLiveModeTransactions = 0;
        let withState = 0;
        const byContactInScope = new Map<string, { count: number; gross: number; refunded: number }>();

        for (const r of rows) {
            const status = norm(r.status).toLowerCase();
            const refundLike = isRefundLike(status);
            const succeededRevenue = isSucceededRevenueStatus(status);
            const liveModeEligible = r.liveMode !== false;
            const succeededRevenueLive = succeededRevenue && liveModeEligible;
            const refundedThisRow = Math.max(0, Number(r.amountRefunded || 0));
            if (refundLike || refundedThisRow > 0) {
                refundedTransactions++;
                refundedAmount += refundedThisRow > 0 ? refundedThisRow : Math.abs(Number(r.amount || 0));
            }
            if (succeededRevenue) {
                allSucceededTransactions++;
            }
            if (succeededRevenueLive) {
                successfulLiveModeTransactions++;
                grossAmount += r.amount;
            } else {
                nonRevenueTransactions++;
            }

            const cid = norm(r.contactId);
            if (cid) {
                const prev = byContactInScope.get(cid) || { count: 0, gross: 0, refunded: 0 };
                prev.count += 1;
                if (succeededRevenueLive) prev.gross += r.amount;
                if (refundLike) prev.refunded += r.amount;
                byContactInScope.set(cid, prev);
            }

            const st = normalizeStateName(r.state);
            const city = norm(r.city);
            const county = norm(r.county);
            if (city) {
                byCityCount[city] = (byCityCount[city] || 0) + 1;
                if (succeededRevenueLive) byCityAmount[city] = Number(((byCityAmount[city] || 0) + r.amount).toFixed(2));
            } else {
                byCityCount.__unknown = (byCityCount.__unknown || 0) + 1;
                if (succeededRevenueLive) byCityAmount.__unknown = Number(((byCityAmount.__unknown || 0) + r.amount).toFixed(2));
            }
            if (county) {
                byCountyCount[county] = (byCountyCount[county] || 0) + 1;
                if (succeededRevenueLive) byCountyAmount[county] = Number(((byCountyAmount[county] || 0) + r.amount).toFixed(2));
            } else {
                byCountyCount.__unknown = (byCountyCount.__unknown || 0) + 1;
                if (succeededRevenueLive) byCountyAmount.__unknown = Number(((byCountyAmount.__unknown || 0) + r.amount).toFixed(2));
            }
            if (!st) {
                byStateCount.__unknown = (byStateCount.__unknown || 0) + 1;
                if (succeededRevenueLive) {
                    byStateAmount.__unknown = Number(((byStateAmount.__unknown || 0) + r.amount).toFixed(2));
                }
                continue;
            }

            withState++;
            byStateCount[st] = (byStateCount[st] || 0) + 1;
            if (succeededRevenueLive) {
                byStateAmount[st] = Number(((byStateAmount[st] || 0) + r.amount).toFixed(2));
            }
        }

        const lifetimeByContact = new Map<string, { gross: number; net: number; orders: number }>();
        for (const r of allRows) {
            const cid = norm(r.contactId);
            if (!cid) continue;
            const status = norm(r.status).toLowerCase();
            const isRefund = isRefundLike(status);
            const isSucceeded = isSucceededRevenueStatus(status);
            const liveModeEligible = r.liveMode !== false;
            const prev = lifetimeByContact.get(cid) || { gross: 0, net: 0, orders: 0 };
            if (isSucceeded && liveModeEligible) prev.gross += r.amount;
            if (isRefund) prev.net += -Math.abs(r.amount);
            else if (isSucceeded && liveModeEligible) prev.net += r.amount;
            prev.orders += 1;
            lifetimeByContact.set(cid, prev);
        }

        const scopedContactIds = Array.from(byContactInScope.keys());
        const avgLifetimeOrderValue = scopedContactIds.length
            ? Number(
                (
                    scopedContactIds.reduce((acc, cid) => acc + Number(lifetimeByContact.get(cid)?.net || 0), 0) /
                    scopedContactIds.length
                ).toFixed(2),
            )
            : 0;

        const uniqueCustomers = scopedContactIds.length;
        const repeatCustomers = scopedContactIds.filter((cid) => Number(byContactInScope.get(cid)?.count || 0) > 1).length;

        for (const r of rows) {
            const cid = norm(r.contactId);
            if (!cid) continue;
            const life = lifetimeByContact.get(cid);
            if (!life) continue;
            r.contactLifetimeNet = Number((life.net || 0).toFixed(2));
            r.contactLifetimeOrders = Number(life.orders || 0);
        }

        const total = rows.length;
        const netAmount = Number((grossAmount - refundedAmount).toFixed(2));
        const kpis = {
            totalTransactions: total,
            successfulTransactions: successfulLiveModeTransactions,
            successfulLiveModeTransactions,
            nonRevenueTransactions,
            grossAmount: Number(grossAmount.toFixed(2)),
            avgTicket: successfulLiveModeTransactions
                ? Number((grossAmount / successfulLiveModeTransactions).toFixed(2))
                : 0,
            refundedTransactions,
            refundedAmount: Number(refundedAmount.toFixed(2)),
            netAmount,
            withState,
            stateRate: pct(withState, total),
            inferredFromContact,
            uniqueCustomers,
            avgOrdersPerCustomer: uniqueCustomers ? Number((total / uniqueCustomers).toFixed(2)) : 0,
            repeatCustomerRate: uniqueCustomers ? pct(repeatCustomers, uniqueCustomers) : 0,
            avgLifetimeOrderValue,
        };

        const resp: ApiResponse = {
            ok: true,
            range: { start, end },
            total,
            kpis,
            byStateCount,
            byStateAmount,
            byCityCount,
            byCityAmount,
            byCountyCount,
            byCountyAmount,
            rows,
            cache: {
                source: cacheSource,
                snapshotUpdatedAt: snapshotUpdatedAtIso || undefined,
                snapshotCoverage:
                    covNow.newestIso || covNow.oldestIso
                        ? { newestCreatedAt: covNow.newestIso, oldestCreatedAt: covNow.oldestIso }
                        : undefined,
                fetchedPages: fetchedPages || undefined,
                hitPageCap: hitPageCap || undefined,
                snapshotComplete:
                    cacheSource === "snapshot"
                        ? typeof snapshot?.complete === "boolean"
                            ? snapshot.complete
                            : undefined
                        : !hitPageCap,
                usedIncremental: usedIncremental || undefined,
                refreshReason: refreshReason || undefined,
            },
            ...(debug
                ? {
                    debug: {
                        locationId,
                        dedupedSnapshotTransactions: allRows.length,
                        scopedTransactions: rows.length,
                        sampleRow: rows[0] || null,
                        allSucceededTransactions,
                        successfulLiveModeTransactions,
                        scopedUniqueCustomers: uniqueCustomers,
                        scopedRepeatCustomers: repeatCustomers,
                    },
                }
                : {}),
        };

        setCache(start, end, tenantId, integrationKey, resp);
        await writeDashboardKpiCache({
            tenantId: tenantId,
            module: "transactions",
            integrationKey,
            start: start,
            end: end,
            preset: norm(url.searchParams.get("preset")) || "",
            compare: url.searchParams.get("compare") === "1",
            source: "ghl_transactions_refresh",
            payload: resp as unknown as Record<string, unknown>,
            ttlSec: Number(process.env.TRANSACTIONS_RANGE_DB_CACHE_TTL_SEC || 300),
        });
        return NextResponse.json(resp);
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message || "Failed to load transactions dashboard." } satisfies ApiResponse,
            { status: 500 },
        );
    }
}
