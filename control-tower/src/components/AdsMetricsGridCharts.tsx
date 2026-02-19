"use client";

import { useMemo } from "react";

type TrendRow = {
  date?: string;
  day?: string;
  keys?: unknown[];
  impressions?: unknown;
  clicks?: unknown;
  conversions?: unknown;
  cost?: unknown;
  avgCpc?: unknown;
  ctr?: unknown;
};

type BucketAgg = {
  bucket: string;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}
function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function pickDate(r: TrendRow) {
  return s(r.date) || s(r.day) || s(Array.isArray(r.keys) ? r.keys[0] : "");
}
function toISOWeek(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 864e5));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function toMonth(dateStr: string) {
  return dateStr.slice(0, 7);
}

function formatCompact(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${Math.round(v * 100) / 100}`;
}
function formatMoney(v: number) {
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function toMetricCards(points: BucketAgg[]) {
  const costSeries = points.map((p) => p.cost);
  const convSeries = points.map((p) => p.conversions);
  const cpcSeries = points.map((p) => (p.clicks > 0 ? p.cost / p.clicks : 0));
  const ctrSeries = points.map((p) =>
    p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0,
  );
  const clicksSeries = points.map((p) => p.clicks);
  const imprSeries = points.map((p) => p.impressions);

  const totalCost = points.reduce((acc, p) => acc + p.cost, 0);
  const totalConversions = points.reduce((acc, p) => acc + p.conversions, 0);
  const totalClicks = points.reduce((acc, p) => acc + p.clicks, 0);
  const totalImpressions = points.reduce((acc, p) => acc + p.impressions, 0);

  const weightedAvgCpc = totalClicks > 0 ? totalCost / totalClicks : 0;
  const weightedCtrPct =
    totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  return [
    {
      key: "cost",
      title: "Cost",
      valueText: formatMoney(totalCost),
      peakText: formatMoney(Math.max(...costSeries, 0)),
      unit: "USD",
      series: costSeries,
    },
    {
      key: "conversions",
      title: "Conversions",
      valueText: formatCompact(totalConversions),
      peakText: formatCompact(Math.max(...convSeries, 0)),
      unit: "count",
      series: convSeries,
    },
    {
      key: "avgCpc",
      title: "Avg CPC",
      valueText: formatMoney(weightedAvgCpc),
      peakText: formatMoney(Math.max(...cpcSeries, 0)),
      unit: "USD",
      series: cpcSeries,
    },
    {
      key: "ctr",
      title: "CTR",
      valueText: `${weightedCtrPct.toFixed(2)}%`,
      peakText: `${Math.max(...ctrSeries, 0).toFixed(2)}%`,
      unit: "pct",
      series: ctrSeries,
    },
    {
      key: "clicks",
      title: "Clicks",
      valueText: formatCompact(totalClicks),
      peakText: formatCompact(Math.max(...clicksSeries, 0)),
      unit: "count",
      series: clicksSeries,
    },
    {
      key: "impressions",
      title: "Impressions",
      valueText: formatCompact(totalImpressions),
      peakText: formatCompact(Math.max(...imprSeries, 0)),
      unit: "count",
      series: imprSeries,
    },
  ];
}

function sparkPath(values: number[], w: number, h: number) {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1e-9, max - min);
  const x = (i: number) => (values.length <= 1 ? 0 : (i / (values.length - 1)) * w);
  const y = (v: number) => h - ((v - min) / span) * h;
  let d = "";
  for (let i = 0; i < values.length; i++) {
    const xi = x(i);
    const yi = y(values[i] || 0);
    d += i === 0 ? `M ${xi} ${yi}` : ` L ${xi} ${yi}`;
  }
  return d;
}

export default function AdsMetricsGridCharts({
  trend,
  mode,
  startDate,
  endDate,
}: {
  trend: TrendRow[];
  mode: "day" | "week" | "month";
  startDate?: string | null;
  endDate?: string | null;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, BucketAgg>();

    for (const row of trend || []) {
      const date = pickDate(row);
      if (!date) continue;
      const bucket =
        mode === "day" ? date : mode === "week" ? toISOWeek(date) : toMonth(date);

      const prev = m.get(bucket) || {
        bucket,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        cost: 0,
      };

      prev.impressions += n(row.impressions);
      prev.clicks += n(row.clicks);
      prev.conversions += n(row.conversions);
      prev.cost += n(row.cost);
      m.set(bucket, prev);
    }

    const out = Array.from(m.values());
    out.sort((a, b) => a.bucket.localeCompare(b.bucket));
    return out;
  }, [trend, mode]);

  const cards = useMemo(() => toMetricCards(grouped), [grouped]);

  if (!grouped.length) {
    return <div className="mini">No hay data de tendencia para este rango.</div>;
  }

  return (
    <div className="adsTrendBoard">
      <div className="adsTrendBoardMeta mini">
        Range: <b>{startDate || grouped[0]?.bucket}</b> →{" "}
        <b>{endDate || grouped[grouped.length - 1]?.bucket}</b> · Group by{" "}
        <b>{mode}</b>
      </div>
      <div className="adsTrendGrid">
        {cards.map((card) => {
          const d = sparkPath(card.series, 320, 84);
          const first = card.series[0] || 0;
          const last = card.series[card.series.length - 1] || 0;
          const deltaPct = first > 0 ? ((last - first) / first) * 100 : null;
          return (
            <div className="adsTrendCard" key={card.key}>
              <div className="adsTrendCardTop">
                <div className="adsTrendCardTitle">{card.title}</div>
                <div className="adsTrendCardValue">{card.valueText}</div>
              </div>
              <svg
                viewBox="0 0 320 84"
                width="100%"
                height={84}
                className="adsTrendSpark"
                preserveAspectRatio="none"
              >
                <path d={d} fill="none" strokeWidth={2.5} />
              </svg>
              <div className="adsTrendCardFoot mini">
                <span>Peak: <b>{card.peakText}</b></span>
                <span>
                  Delta:{" "}
                  <b>
                    {deltaPct == null
                      ? "—"
                      : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}
                  </b>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
