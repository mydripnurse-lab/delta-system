"use client";

import { useMemo } from "react";
import PremiumTrendChart, { type PremiumTrendPoint } from "@/components/PremiumTrendChart";

type TrendRow = {
  date?: string;
  day?: string;
  keys?: any[];
  value?: number;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n * 100) / 100);
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

function fromISODate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toISODate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function weekStartFromDate(dateStr: string) {
  const d = fromISODate(dateStr);
  if (!d) return null;
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum);
  return d;
}

function monthStartFromDate(dateStr: string) {
  const d = fromISODate(dateStr);
  if (!d) return null;
  d.setUTCDate(1);
  return d;
}

function densifyPoints(
  points: PremiumTrendPoint[],
  mode: "day" | "week" | "month",
  startDate?: string | null,
  endDate?: string | null,
) {
  const start = String(startDate || "").trim();
  const end = String(endDate || "").trim();
  if (!start || !end) return points;

  const byKey = new Map(points.map((p) => [p.key, Number(p.value || 0)]));
  if (mode === "day") {
    const a = fromISODate(start);
    const b = fromISODate(end);
    if (!a || !b || a.getTime() > b.getTime()) return points;
    const out: PremiumTrendPoint[] = [];
    const cur = new Date(a);
    while (cur.getTime() <= b.getTime()) {
      const key = toISODate(cur);
      out.push({ key, label: key, value: byKey.get(key) || 0 });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
  }

  if (mode === "week") {
    const a = weekStartFromDate(start);
    const b = weekStartFromDate(end);
    if (!a || !b || a.getTime() > b.getTime()) return points;
    const out: PremiumTrendPoint[] = [];
    const cur = new Date(a);
    while (cur.getTime() <= b.getTime()) {
      const key = toISOWeek(toISODate(cur));
      out.push({ key, label: key, value: byKey.get(key) || 0 });
      cur.setUTCDate(cur.getUTCDate() + 7);
    }
    return out;
  }

  const a = monthStartFromDate(start);
  const b = monthStartFromDate(end);
  if (!a || !b || a.getTime() > b.getTime()) return points;
  const out: PremiumTrendPoint[] = [];
  const cur = new Date(a);
  while (cur.getTime() <= b.getTime()) {
    const key = toMonth(toISODate(cur));
    out.push({ key, label: key, value: byKey.get(key) || 0 });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

function groupTrend(
  rows: TrendRow[],
  mode: "day" | "week" | "month",
): PremiumTrendPoint[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = pickDate(r);
    if (!d) continue;
    const bucket = mode === "day" ? d : mode === "week" ? toISOWeek(d) : toMonth(d);
    m.set(bucket, (m.get(bucket) || 0) + num(r.value));
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, value]) => ({ key: bucket, label: bucket, value }));
}

export default function AdsTrendChart({
  trend,
  mode,
  startDate,
  endDate,
  seriesLabel,
  unitHint,
  comparePct,
  onModeChange,
  showModeSwitch = true,
}: {
  trend: TrendRow[];
  mode: "day" | "week" | "month";
  startDate?: string | null;
  endDate?: string | null;
  seriesLabel: string;
  unitHint?: string;
  comparePct?: number | null;
  onModeChange?: (mode: "day" | "week" | "month") => void;
  showModeSwitch?: boolean;
}) {
  const points = useMemo(
    () => densifyPoints(groupTrend(trend || [], mode), mode, startDate, endDate),
    [trend, mode, startDate, endDate],
  );
  const comparePoints = useMemo(() => {
    const factor = 1 + Number(comparePct ?? NaN);
    if (!Number.isFinite(factor) || factor <= 0) return [];
    return points.map((p) => ({
      key: p.key,
      label: p.label,
      value: p.value / factor,
    }));
  }, [points, comparePct]);
  const hint = unitHint ? ` (${unitHint})` : "";

  return (
    <PremiumTrendChart
      title={`${seriesLabel} trend${hint}`}
      subtitle={`Range: ${startDate || "—"} → ${endDate || "—"} (${mode})`}
      points={points}
      comparePoints={comparePoints}
      mode={mode}
      onModeChange={onModeChange}
      showModeSwitch={showModeSwitch}
      valueFormatter={fmtCompact}
      footerHint="Hover un punto para ver detalle y comparar picos."
    />
  );
}
