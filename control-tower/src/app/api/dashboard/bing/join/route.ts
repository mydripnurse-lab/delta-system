import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { loadGscCatalogIndex } from "@/lib/gscCatalogIndex";
import { loadStateCatalog } from "@/lib/stateCatalog";

export const runtime = "nodejs";

type JsonObj = Record<string, unknown>;

type TrendRow = {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function inDateRange(dateIso: string, startIso: string, endIso: string) {
  const d = s(dateIso);
  const a = s(startIso);
  const b = s(endIso);
  if (!d || !a || !b) return true;
  const dm = new Date(`${d}T00:00:00Z`).getTime();
  const am = new Date(`${a}T00:00:00Z`).getTime();
  const bm = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(dm) || !Number.isFinite(am) || !Number.isFinite(bm)) return true;
  return dm >= am && dm <= bm;
}

async function readJsonRaw(p: string) {
  const txt = await fs.readFile(p, "utf8");
  return JSON.parse(txt) as JsonObj;
}

function hostnameFromPage(page: string) {
  const raw = s(page);
  if (!raw) return "";
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return (u.hostname || "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeHost(host: string) {
  const h = s(host).toLowerCase().replace(/\.$/, "");
  if (!h) return "";
  return h.startsWith("www.") ? h.slice(4) : h;
}

function normalizeStateName(v: string) {
  const x = s(v);
  if (!x) return "__unknown";
  return x;
}

function aggregateTrendFromRows(rows: Array<JsonObj>) {
  const byDate = new Map<string, { impressions: number; clicks: number; ctrAcc: number; ctrW: number; posAcc: number; posW: number }>();
  for (const r of rows) {
    const d = s(r.date);
    if (!d) continue;
    const i = n(r.impressions);
    const c = n(r.clicks);
    const ctr = n(r.ctr);
    const p = n(r.position);
    const prev = byDate.get(d) || { impressions: 0, clicks: 0, ctrAcc: 0, ctrW: 0, posAcc: 0, posW: 0 };
    prev.impressions += i;
    prev.clicks += c;
    prev.ctrAcc += ctr * Math.max(i, 1);
    prev.ctrW += Math.max(i, 1);
    if (p > 0) {
      prev.posAcc += p * Math.max(i, 1);
      prev.posW += Math.max(i, 1);
    }
    byDate.set(d, prev);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, x]) => ({
      date,
      impressions: x.impressions,
      clicks: x.clicks,
      ctr: x.ctrW > 0 ? x.ctrAcc / x.ctrW : 0,
      position: x.posW > 0 ? x.posAcc / x.posW : 0,
    }));
}

function groupTop(rows: Array<JsonObj>, keyField: "query" | "page") {
  const byKey = new Map<string, { impressions: number; clicks: number; ctrAcc: number; ctrW: number; posAcc: number; posW: number }>();
  for (const r of rows) {
    const key = s(r[keyField]);
    if (!key) continue;
    const impressions = n(r.impressions);
    const clicks = n(r.clicks);
    const ctr = n(r.ctr);
    const position = n(r.position);
    const prev = byKey.get(key) || { impressions: 0, clicks: 0, ctrAcc: 0, ctrW: 0, posAcc: 0, posW: 0 };
    prev.impressions += impressions;
    prev.clicks += clicks;
    prev.ctrAcc += ctr * Math.max(impressions, 1);
    prev.ctrW += Math.max(impressions, 1);
    if (position > 0) {
      prev.posAcc += position * Math.max(impressions, 1);
      prev.posW += Math.max(impressions, 1);
    }
    byKey.set(key, prev);
  }

  return Array.from(byKey.entries())
    .map(([key, v]) => ({
      [keyField]: key,
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: v.ctrW > 0 ? v.ctrAcc / v.ctrW : 0,
      position: v.posW > 0 ? v.posAcc / v.posW : 0,
    }))
    .sort((a, b) => n(b.impressions) - n(a.impressions))
    .slice(0, 100);
}

function summarize(rows: Array<JsonObj>, startDate: string, endDate: string) {
  let impressions = 0;
  let clicks = 0;
  let posAcc = 0;
  let posW = 0;
  for (const r of rows) {
    const i = n(r.impressions);
    const c = n(r.clicks);
    const p = n(r.position);
    impressions += i;
    clicks += c;
    if (p > 0) {
      posAcc += p * Math.max(i, 1);
      posW += Math.max(i, 1);
    }
  }
  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: posW > 0 ? posAcc / posW : 0,
    pagesCounted: rows.length,
    generatedAt: new Date().toISOString(),
    startDate,
    endDate,
  };
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function summarizeTrend(rows: TrendRow[]) {
  let impressions = 0;
  let clicks = 0;
  let posAcc = 0;
  let posW = 0;
  for (const r of rows) {
    impressions += n(r.impressions);
    clicks += n(r.clicks);
    if (n(r.position) > 0) {
      posAcc += n(r.position) * Math.max(n(r.impressions), 1);
      posW += Math.max(n(r.impressions), 1);
    }
  }
  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: posW > 0 ? posAcc / posW : 0,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const state = s(searchParams.get("state"));
    const compareEnabled = s(searchParams.get("compare")) === "1";
    const startParam = s(searchParams.get("start"));
    const endParam = s(searchParams.get("end"));

    const cacheDir = path.join(process.cwd(), "data", "cache", "bing");
    const metaRaw = await readJsonRaw(path.join(cacheDir, "meta.json"));
    const pagesRaw = await readJsonRaw(path.join(cacheDir, "pages.json"));
    const queriesRaw = await readJsonRaw(path.join(cacheDir, "queries.json"));
    const trendRaw = await readJsonRaw(path.join(cacheDir, "trend.json"));

    const meta = metaRaw as JsonObj;
    const startDate = startParam || s(meta.startDate);
    const endDate = endParam || s(meta.endDate);

    const allPages = Array.isArray(pagesRaw.rows) ? (pagesRaw.rows as JsonObj[]) : [];
    const allQueries = Array.isArray(queriesRaw.rows) ? (queriesRaw.rows as JsonObj[]) : [];
    const allTrend = (Array.isArray(trendRaw.rows) ? trendRaw.rows : []) as TrendRow[];

    const pages = allPages.filter((r) => inDateRange(s(r.date), startDate, endDate));
    const queries = allQueries.filter((r) => inDateRange(s(r.date), startDate, endDate));
    const trend = allTrend.filter((r) => inDateRange(s(r.date), startDate, endDate));

    const catalog = await loadGscCatalogIndex({ force: false });
    const stateCatalog = await loadStateCatalog();
    const stateRowsMap = new Map<string, { state: string; impressions: number; clicks: number; ctrAcc: number; ctrW: number; posAcc: number; posW: number; pagesCounted: number; keywordsCount: number }>();

    const siteHost = normalizeHost(hostnameFromPage(s(meta.siteUrl)));
    const pageRowsWithState = pages.map((r) => {
      const page = s(r.page);
      const hostRaw = hostnameFromPage(page);
      const host = normalizeHost(hostRaw || siteHost);
      const mappedStateRaw = host
        ? (catalog.byHostname?.[host]?.state ||
            catalog.byHostname?.[`www.${host}`]?.state ||
            stateCatalog.hostToState?.[host]?.name ||
            stateCatalog.hostToState?.[`www.${host}`]?.name ||
            "__unknown")
        : "__unknown";
      const mappedState = normalizeStateName(mappedStateRaw);
      const impressions = n(r.impressions);
      const clicks = n(r.clicks);
      const ctr = n(r.ctr);
      const position = n(r.position);

      const prev = stateRowsMap.get(mappedState) || {
        state: mappedState,
        impressions: 0,
        clicks: 0,
        ctrAcc: 0,
        ctrW: 0,
        posAcc: 0,
        posW: 0,
        pagesCounted: 0,
        keywordsCount: 0,
      };
      prev.impressions += impressions;
      prev.clicks += clicks;
      prev.ctrAcc += ctr * Math.max(impressions, 1);
      prev.ctrW += Math.max(impressions, 1);
      if (position > 0) {
        prev.posAcc += position * Math.max(impressions, 1);
        prev.posW += Math.max(impressions, 1);
      }
      prev.pagesCounted += 1;
      stateRowsMap.set(mappedState, prev);

      return {
        ...r,
        __state: mappedState,
      };
    });

    const stateRows = Array.from(stateRowsMap.values())
      .map((x) => ({
        state: x.state,
        impressions: x.impressions,
        clicks: x.clicks,
        ctr: x.ctrW > 0 ? x.ctrAcc / x.ctrW : 0,
        position: x.posW > 0 ? x.posAcc / x.posW : 0,
        pagesCounted: x.pagesCounted,
        keywordsCount: x.keywordsCount,
      }))
      .sort((a, b) => n(b.impressions) - n(a.impressions));

    const filteredPages = state ? pageRowsWithState.filter((r) => s(r.__state) === state) : pageRowsWithState;
    const summaryOverall = summarize(pageRowsWithState, startDate, endDate);
    const summaryFiltered = summarize(filteredPages, startDate, endDate);

    const topQueries = groupTop(queries, "query");
    const topPages = groupTop(filteredPages as JsonObj[], "page");

    const impByQueryOverall = new Map<string, number>();
    for (const q of queries) {
      const key = s(q.query);
      if (!key) continue;
      impByQueryOverall.set(key, (impByQueryOverall.get(key) || 0) + n(q.impressions));
    }
    const topKeywordsOverall = Array.from(impByQueryOverall.entries())
      .map(([query, impressions]) => ({ query, impressions }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 100);

    const trendBase = aggregateTrendFromRows(pageRowsWithState as JsonObj[]);
    const trendAll = trendBase.length ? trendBase : trend;
    const trendFiltered = state ? aggregateTrendFromRows(filteredPages as JsonObj[]) : trendAll;

    let compare: JsonObj | null = null;
    if (compareEnabled && startDate && endDate && trend.length) {
      const a = new Date(startDate).getTime();
      const b = new Date(endDate).getTime();
      const windowDays = Math.max(1, Math.round((b - a) / 86400000) + 1);
      const prevEnd = addDays(startDate, -1);
      const prevStart = addDays(startDate, -windowDays);

      const prevTrend = trendAll.filter((r) => {
        const d = new Date(r.date).getTime();
        return Number.isFinite(d) && d >= new Date(prevStart).getTime() && d <= new Date(prevEnd).getTime();
      });

      const curSum = summarizeTrend(trendFiltered);
      const prevSum = summarizeTrend(prevTrend);
      const pct = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);

      compare = {
        windowDays,
        current: { ...curSum, startDate, endDate },
        previous: { ...prevSum, startDate: prevStart, endDate: prevEnd },
        pct: {
          impressions: pct(curSum.impressions, prevSum.impressions),
          clicks: pct(curSum.clicks, prevSum.clicks),
          ctr: pct(curSum.ctr, prevSum.ctr),
          position: pct(curSum.position, prevSum.position),
        },
      };
    }

    return NextResponse.json({
      ok: true,
      meta: {
        ok: true,
        source: "bing_webmaster",
        siteUrl: s(meta.siteUrl),
        range: s(meta.range),
        startDate,
        endDate,
        fetchedAt: s(meta.fetchedAt),
      },
      summaryOverall,
      summaryFiltered,
      summaryNationwide: {
        ...summaryOverall,
        label: "Bing Webmaster",
        rootHost: s(meta.siteUrl),
      },
      summaryFunnels: {
        impressions: 0,
        clicks: 0,
        ctr: 0,
        position: 0,
        pagesCounted: 0,
        label: "Funnels (not available in Bing snapshot)",
      },
      keywordsOverall: topKeywordsOverall.length,
      keywordsFiltered: topKeywordsOverall.length,
      topKeywordsOverall,
      topKeywordsFiltered: topKeywordsOverall,
      stateRows,
      funnels: [],
      top: {
        queries: topQueries,
        pages: topPages,
      },
      trend,
      trendFiltered,
      compareEnabled,
      compare,
      debug: {
        cacheDir,
        mappedHosts: Object.keys(catalog.byHostname || {}).length,
        mappedHostsFromStateCatalog: Object.keys(stateCatalog.hostToState || {}).length,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to join Bing cache data" }, { status: 500 });
  }
}
