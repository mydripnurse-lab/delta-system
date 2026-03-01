"use client";

import { useMemo } from "react";
import PremiumTrendChart, { type PremiumTrendPoint } from "@/components/PremiumTrendChart";

type TrendRow = {
  date?: string;
  day?: string;
  keys?: unknown[];
  impressions?: unknown;
  clicks?: unknown;
  conversions?: unknown;
  cost?: unknown;
};

type ComparePct = {
  impressions?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  cost?: number | null;
  avgCpc?: number | null;
  ctr?: number | null;
};

type BucketAgg = {
  bucket: string;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
};

type MetricCard = {
  key: "cost" | "conversions" | "avgCpc" | "ctr" | "clicks" | "impressions";
  title: string;
  unit: "usd" | "count" | "pct";
  points: PremiumTrendPoint[];
  comparePoints: PremiumTrendPoint[];
  formatter: (n: number) => string;
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
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 864e5));
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

function formatPct(v: number) {
  return `${v.toFixed(2)}%`;
}

function pctToFactor(deltaPct: number | null | undefined) {
  if (deltaPct === null || deltaPct === undefined || !Number.isFinite(deltaPct)) return null;
  const factor = 1 + Number(deltaPct);
  if (factor <= 0) return null;
  return factor;
}

function toPoints(values: Array<{ key: string; value: number }>) {
  return values.map((v) => ({ key: v.key, label: v.key, value: v.value }));
}

function buildCards(rows: BucketAgg[], comparePct: ComparePct | null | undefined): MetricCard[] {
  const costSeries = rows.map((p) => ({ key: p.bucket, value: p.cost }));
  const convSeries = rows.map((p) => ({ key: p.bucket, value: p.conversions }));
  const cpcSeries = rows.map((p) => ({
    key: p.bucket,
    value: p.clicks > 0 ? p.cost / p.clicks : 0,
  }));
  const ctrSeries = rows.map((p) => ({
    key: p.bucket,
    value: p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0,
  }));
  const clicksSeries = rows.map((p) => ({ key: p.bucket, value: p.clicks }));
  const imprSeries = rows.map((p) => ({ key: p.bucket, value: p.impressions }));

  const buildCompare = (
    series: Array<{ key: string; value: number }>,
    delta: number | null | undefined,
  ) => {
    const factor = pctToFactor(delta);
    if (!factor) return [];
    return series.map((p) => ({
      key: p.key,
      value: p.value / factor,
    }));
  };

  return [
    {
      key: "cost",
      title: "Cost",
      unit: "usd",
      points: toPoints(costSeries),
      comparePoints: toPoints(buildCompare(costSeries, comparePct?.cost)),
      formatter: formatMoney,
    },
    {
      key: "conversions",
      title: "Conversions",
      unit: "count",
      points: toPoints(convSeries),
      comparePoints: toPoints(buildCompare(convSeries, comparePct?.conversions)),
      formatter: formatCompact,
    },
    {
      key: "avgCpc",
      title: "Avg CPC",
      unit: "usd",
      points: toPoints(cpcSeries),
      comparePoints: toPoints(buildCompare(cpcSeries, comparePct?.avgCpc)),
      formatter: formatMoney,
    },
    {
      key: "ctr",
      title: "CTR",
      unit: "pct",
      points: toPoints(ctrSeries),
      comparePoints: toPoints(buildCompare(ctrSeries, comparePct?.ctr)),
      formatter: formatPct,
    },
    {
      key: "clicks",
      title: "Clicks",
      unit: "count",
      points: toPoints(clicksSeries),
      comparePoints: toPoints(buildCompare(clicksSeries, comparePct?.clicks)),
      formatter: formatCompact,
    },
    {
      key: "impressions",
      title: "Impressions",
      unit: "count",
      points: toPoints(imprSeries),
      comparePoints: toPoints(buildCompare(imprSeries, comparePct?.impressions)),
      formatter: formatCompact,
    },
  ];
}

export default function AdsMetricsGridCharts({
  trend,
  mode,
  startDate,
  endDate,
  comparePct,
  onModeChange,
}: {
  trend: TrendRow[];
  mode: "day" | "week" | "month";
  startDate?: string | null;
  endDate?: string | null;
  comparePct?: ComparePct | null;
  onModeChange?: (mode: "day" | "week" | "month") => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, BucketAgg>();
    for (const row of trend || []) {
      const date = pickDate(row);
      if (!date) continue;
      const bucket = mode === "day" ? date : mode === "week" ? toISOWeek(date) : toMonth(date);
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
    return Array.from(m.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [trend, mode]);

  const cards = useMemo(() => buildCards(grouped, comparePct), [grouped, comparePct]);

  if (!grouped.length) {
    return <div className="mini">No hay data de tendencia para este rango.</div>;
  }

  return (
    <div className="adsTrendBoard">
      <div className="adsTrendBoardMeta mini">
        Range: <b>{startDate || grouped[0]?.bucket}</b> →{" "}
        <b>{endDate || grouped[grouped.length - 1]?.bucket}</b> · Group by <b>{mode}</b>
      </div>
      <div className="adsTrendGrid">
        {cards.map((card) => (
          <div className="adsTrendCard" key={card.key}>
            <PremiumTrendChart
              title={`${card.title} trend`}
              subtitle={`Mode: ${mode}`}
              points={card.points}
              comparePoints={card.comparePoints}
              mode={mode}
              onModeChange={onModeChange}
              showModeSwitch={true}
              valueFormatter={card.formatter}
              footerHint="Hover un punto para ver detalle y comparison."
            />
          </div>
        ))}
      </div>
    </div>
  );
}
