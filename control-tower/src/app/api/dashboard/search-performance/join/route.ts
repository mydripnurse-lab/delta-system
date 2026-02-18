import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AnyObj = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function weightedAvg(values: Array<{ value: number; weight: number }>) {
  let acc = 0;
  let w = 0;
  for (const x of values) {
    if (!Number.isFinite(x.value) || !Number.isFinite(x.weight) || x.weight <= 0) continue;
    acc += x.value * x.weight;
    w += x.weight;
  }
  return w > 0 ? acc / w : 0;
}

function mergeSummary(a: AnyObj, b: AnyObj) {
  const impressions = n(a.impressions) + n(b.impressions);
  const clicks = n(a.clicks) + n(b.clicks);
  const position = weightedAvg([
    { value: n(a.position), weight: Math.max(1, n(a.impressions)) },
    { value: n(b.position), weight: Math.max(1, n(b.impressions)) },
  ]);
  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position,
    pagesCounted: n(a.pagesCounted) + n(b.pagesCounted),
    generatedAt: new Date().toISOString(),
    startDate: s(a.startDate) || s(b.startDate),
    endDate: s(a.endDate) || s(b.endDate),
  };
}

function mergeTop(rowsA: AnyObj[], rowsB: AnyObj[], keyField: "query" | "page") {
  const by = new Map<string, AnyObj>();
  const ingest = (r: AnyObj) => {
    const key = s(r[keyField]);
    if (!key) return;
    const prev: any = by.get(key) || { [keyField]: key, impressions: 0, clicks: 0, ctrAcc: 0, ctrW: 0, posAcc: 0, posW: 0 };
    const impressions = n(r.impressions);
    const clicks = n(r.clicks);
    const ctr = n(r.ctr);
    const position = n(r.position);
    prev.impressions += impressions;
    prev.clicks += clicks;
    prev.ctrAcc += ctr * Math.max(impressions, 1);
    prev.ctrW += Math.max(impressions, 1);
    if (position > 0) {
      prev.posAcc += position * Math.max(impressions, 1);
      prev.posW += Math.max(impressions, 1);
    }
    by.set(key, prev);
  };

  for (const r of rowsA || []) ingest(r || {});
  for (const r of rowsB || []) ingest(r || {});

  return Array.from(by.values())
    .map((x) => ({
      [keyField]: s(x[keyField]),
      impressions: n(x.impressions),
      clicks: n(x.clicks),
      ctr: n(x.ctrW) > 0 ? n(x.ctrAcc) / n(x.ctrW) : 0,
      position: n(x.posW) > 0 ? n(x.posAcc) / n(x.posW) : 0,
    }))
    .sort((x, y) => n(y.impressions) - n(x.impressions))
    .slice(0, 100);
}

function mergeStateRows(aRows: AnyObj[], bRows: AnyObj[]) {
  const by = new Map<string, AnyObj>();
  const ingest = (r: AnyObj) => {
    const st = s(r.state) || "__unknown";
    const prev: any = by.get(st) || { state: st, impressions: 0, clicks: 0, ctrAcc: 0, ctrW: 0, posAcc: 0, posW: 0, pagesCounted: 0, keywordsCount: 0 };
    const impressions = n(r.impressions);
    prev.impressions += impressions;
    prev.clicks += n(r.clicks);
    prev.ctrAcc += n(r.ctr) * Math.max(impressions, 1);
    prev.ctrW += Math.max(impressions, 1);
    if (n(r.position) > 0) {
      prev.posAcc += n(r.position) * Math.max(impressions, 1);
      prev.posW += Math.max(impressions, 1);
    }
    prev.pagesCounted += n(r.pagesCounted);
    prev.keywordsCount += n(r.keywordsCount);
    by.set(st, prev);
  };

  for (const r of aRows || []) ingest(r || {});
  for (const r of bRows || []) ingest(r || {});

  return Array.from(by.values())
    .map((x) => ({
      state: x.state,
      impressions: n(x.impressions),
      clicks: n(x.clicks),
      ctr: n(x.ctrW) > 0 ? n(x.ctrAcc) / n(x.ctrW) : 0,
      position: n(x.posW) > 0 ? n(x.posAcc) / n(x.posW) : 0,
      pagesCounted: n(x.pagesCounted),
      keywordsCount: n(x.keywordsCount),
    }))
    .sort((x, y) => n(y.impressions) - n(x.impressions));
}

function mergeTrendRows(aRows: AnyObj[], bRows: AnyObj[]) {
  const by = new Map<string, AnyObj>();
  const ingest = (r: AnyObj) => {
    const d = s(r.date);
    if (!d) return;
    const prev: any = by.get(d) || { date: d, impressions: 0, clicks: 0, ctrAcc: 0, ctrW: 0, posAcc: 0, posW: 0 };
    const impressions = n(r.impressions);
    prev.impressions += impressions;
    prev.clicks += n(r.clicks);
    prev.ctrAcc += n(r.ctr) * Math.max(impressions, 1);
    prev.ctrW += Math.max(impressions, 1);
    if (n(r.position) > 0) {
      prev.posAcc += n(r.position) * Math.max(impressions, 1);
      prev.posW += Math.max(impressions, 1);
    }
    by.set(d, prev);
  };
  for (const r of aRows || []) ingest(r || {});
  for (const r of bRows || []) ingest(r || {});

  return Array.from(by.values())
    .sort((x, y) => s(x.date).localeCompare(s(y.date)))
    .map((x) => ({
      date: s(x.date),
      impressions: n(x.impressions),
      clicks: n(x.clicks),
      ctr: n(x.ctrW) > 0 ? n(x.ctrAcc) / n(x.ctrW) : 0,
      position: n(x.posW) > 0 ? n(x.posAcc) / n(x.posW) : 0,
    }));
}

function summarizeTrend(rows: AnyObj[]) {
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

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pctWithZeroBase(cur: number, prev: number) {
  if (prev > 0) return (cur - prev) / prev;
  if (cur === 0) return 0;
  return 1;
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const origin = u.origin;
    const compareEnabled = s(u.searchParams.get("compare")) === "1";

    const qs = u.searchParams.toString();
    const [gscRes, bingRes] = await Promise.all([
      fetch(`${origin}/api/dashboard/gsc/join?${qs}`, { cache: "no-store" }),
      fetch(`${origin}/api/dashboard/bing/join?${qs}`, { cache: "no-store" }),
    ]);

    const [gsc, bing] = await Promise.all([gscRes.json(), bingRes.json()]);

    if (!gscRes.ok && !bingRes.ok) {
      return NextResponse.json(
        { ok: false, error: `GSC failed: ${s(gsc?.error)} | Bing failed: ${s(bing?.error)}` },
        { status: 502 },
      );
    }

    const g = gscRes.ok ? gsc : { ok: false };
    const b = bingRes.ok ? bing : { ok: false };

    const summaryOverall = mergeSummary(g.summaryOverall || {}, b.summaryOverall || {});
    const summaryFiltered = mergeSummary(g.summaryFiltered || {}, b.summaryFiltered || {});
    const summaryNationwide = mergeSummary(g.summaryNationwide || {}, b.summaryNationwide || {});

    const stateRows = mergeStateRows(g.stateRows || [], b.stateRows || []);
    const trend = mergeTrendRows(g.trend || [], b.trend || []);
    const trendFiltered = mergeTrendRows(g.trendFiltered || [], b.trendFiltered || []);

    const topQueries = mergeTop(g?.top?.queries || [], b?.top?.queries || [], "query");
    const topPages = mergeTop(g?.top?.pages || [], b?.top?.pages || [], "page");

    const topKeywordsOverall = mergeTop(g.topKeywordsOverall || [], b.topKeywordsOverall || [], "query");
    const topKeywordsFiltered = mergeTop(g.topKeywordsFiltered || [], b.topKeywordsFiltered || [], "query");

    let compare: AnyObj | null = null;
    const startDate = s(summaryOverall.startDate);
    const endDate = s(summaryOverall.endDate);
    if (compareEnabled && startDate && endDate && trend.length) {
      const a = new Date(startDate).getTime();
      const bms = new Date(endDate).getTime();
      const windowDays = Math.max(1, Math.round((bms - a) / 86400000) + 1);
      const prevEnd = addDays(startDate, -1);
      const prevStart = addDays(startDate, -windowDays);
      const prevTrend = trend.filter((r) => {
        const t = new Date(s(r.date)).getTime();
        return Number.isFinite(t) && t >= new Date(prevStart).getTime() && t <= new Date(prevEnd).getTime();
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

    // Fallback: when merged trend does not include previous-window rows,
    // compose compare from child compares (GSC/Bing) if available.
    const compareObj: any = compare;
    const compareMissing =
      !compare ||
      (compare &&
        n(compareObj?.previous?.impressions) === 0 &&
        n(compareObj?.previous?.clicks) === 0);

    if (compareEnabled && compareMissing) {
      const gc = (g?.compare || {}) as AnyObj;
      const bc = (b?.compare || {}) as AnyObj;

      const gCurImp = n((gc.current as AnyObj)?.impressions);
      const gCurClk = n((gc.current as AnyObj)?.clicks);
      const gCurPos = n((gc.current as AnyObj)?.position);
      const gPrevImp = n((gc.previous as AnyObj)?.impressions);
      const gPrevClk = n((gc.previous as AnyObj)?.clicks);
      const gPrevPos = n((gc.previous as AnyObj)?.position);

      const bCurImp = n((bc.current as AnyObj)?.impressions);
      const bCurClk = n((bc.current as AnyObj)?.clicks);
      const bCurPos = n((bc.current as AnyObj)?.position);
      const bPrevImp = n((bc.previous as AnyObj)?.impressions);
      const bPrevClk = n((bc.previous as AnyObj)?.clicks);
      const bPrevPos = n((bc.previous as AnyObj)?.position);

      const curImp = gCurImp + bCurImp;
      const curClk = gCurClk + bCurClk;
      const prevImp = gPrevImp + bPrevImp;
      const prevClk = gPrevClk + bPrevClk;

      const curPos = weightedAvg([
        { value: gCurPos, weight: Math.max(1, gCurImp) },
        { value: bCurPos, weight: Math.max(1, bCurImp) },
      ]);
      const prevPos = weightedAvg([
        { value: gPrevPos, weight: Math.max(1, gPrevImp) },
        { value: bPrevPos, weight: Math.max(1, bPrevImp) },
      ]);

      const curCtr = curImp > 0 ? curClk / curImp : 0;
      const prevCtr = prevImp > 0 ? prevClk / prevImp : 0;

      if (curImp > 0 || prevImp > 0 || curClk > 0 || prevClk > 0) {
        const windowDays = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);
        const prevEnd = addDays(startDate, -1);
        const prevStart = addDays(startDate, -windowDays);

        compare = {
          windowDays,
          current: { impressions: curImp, clicks: curClk, ctr: curCtr, position: curPos, startDate, endDate },
          previous: { impressions: prevImp, clicks: prevClk, ctr: prevCtr, position: prevPos, startDate: prevStart, endDate: prevEnd },
          pct: {
            impressions: pctWithZeroBase(curImp, prevImp),
            clicks: pctWithZeroBase(curClk, prevClk),
            ctr: pctWithZeroBase(curCtr, prevCtr),
            position: pctWithZeroBase(curPos, prevPos),
          },
        };
      }
    }

    return NextResponse.json({
      ok: true,
      meta: {
        ok: true,
        source: "search_performance_all",
        range: s(g?.meta?.range || b?.meta?.range),
        startDate,
        endDate,
        fetchedAt: new Date().toISOString(),
      },
      summaryOverall,
      summaryFiltered,
      summaryNationwide: {
        ...summaryNationwide,
        label: "All Search (GSC + Bing)",
        rootHost: "",
      },
      summaryFunnels: g.summaryFunnels || {
        impressions: 0,
        clicks: 0,
        ctr: 0,
        position: 0,
        pagesCounted: 0,
        label: "Funnels",
      },
      keywordsOverall: n(g.keywordsOverall) + n(b.keywordsOverall),
      keywordsFiltered: n(g.keywordsFiltered) + n(b.keywordsFiltered),
      topKeywordsOverall,
      topKeywordsFiltered,
      stateRows,
      funnels: g.funnels || [],
      top: {
        queries: topQueries,
        pages: topPages,
      },
      trend,
      trendFiltered,
      compareEnabled,
      compare,
      debug: {
        gscOk: !!gscRes.ok,
        bingOk: !!bingRes.ok,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "search performance join failed" }, { status: 500 });
  }
}
