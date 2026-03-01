"use client";

import { useMemo } from "react";
import PremiumTrendChart, { type PremiumTrendPoint } from "@/components/PremiumTrendChart";

type TrendRow = {
  date?: string;
  day?: string;
  keys?: any[];
  impressions?: number;
  clicks?: number;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
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
  const year = d.getUTCFullYear();
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function toMonth(dateStr: string) {
  return dateStr.slice(0, 7);
}

function groupTrend(
  rows: TrendRow[],
  mode: "day" | "week" | "month",
  metric: "impressions" | "clicks",
): PremiumTrendPoint[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = pickDate(r);
    if (!d) continue;
    const bucket = mode === "day" ? d : mode === "week" ? toISOWeek(d) : toMonth(d);
    const value = metric === "impressions" ? num(r.impressions) : num(r.clicks);
    m.set(bucket, (m.get(bucket) || 0) + value);
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, value]) => ({ key: bucket, label: bucket, value }));
}

export default function GSCTrendChart({
  trend,
  metric,
  mode,
  startDate,
  endDate,
  comparePct,
  onModeChange,
  showModeSwitch = true,
}: {
  trend: TrendRow[];
  metric: "impressions" | "clicks";
  mode: "day" | "week" | "month";
  startDate?: string | null;
  endDate?: string | null;
  comparePct?: number | null;
  onModeChange?: (mode: "day" | "week" | "month") => void;
  showModeSwitch?: boolean;
}) {
  const points = useMemo(() => groupTrend(trend || [], mode, metric), [trend, mode, metric]);
  const comparePoints = useMemo(() => {
    const factor = 1 + Number(comparePct ?? NaN);
    if (!Number.isFinite(factor) || factor <= 0) return [];
    return points.map((p) => ({
      key: p.key,
      label: p.label,
      value: p.value / factor,
    }));
  }, [points, comparePct]);

  return (
    <PremiumTrendChart
      title={`${metric === "impressions" ? "Impressions" : "Clicks"} trend`}
      subtitle={`Range: ${startDate || "—"} → ${endDate || "—"} (${mode})`}
      points={points}
      comparePoints={comparePoints}
      mode={mode}
      onModeChange={onModeChange}
      showModeSwitch={showModeSwitch}
      valueFormatter={fmtCompact}
      footerHint="Hover un punto para ver detalle y detectar picos."
    />
  );
}
