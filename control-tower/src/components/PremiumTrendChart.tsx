"use client";

import { useId, useMemo, useState } from "react";

export type PremiumTrendMode = "day" | "week" | "month";
export type PremiumTrendPoint = {
  key: string;
  label: string;
  value: number;
};

type HoverPayload = {
  key: string;
  label: string;
  value: number;
  compareValue: number | null;
  delta: number | null;
  deltaPct: number | null;
};

type Props = {
  title: string;
  subtitle?: string;
  points: PremiumTrendPoint[];
  comparePoints?: PremiumTrendPoint[];
  mode?: PremiumTrendMode;
  onModeChange?: (mode: PremiumTrendMode) => void;
  showModeSwitch?: boolean;
  valueFormatter?: (n: number) => string;
  footerHint?: string;
  emptyLabel?: string;
  onHoverPoint?: (point: HoverPayload | null) => void;
};

function fmtCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n * 100) / 100);
}

function pctDelta(curr: number, prev: number) {
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

function parseIsoDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

function formatXLabel(value: string, mode: PremiumTrendMode) {
  const raw = String(value || "").trim();
  if (!raw) return raw;

  if (mode === "day") {
    const p = parseIsoDate(raw);
    if (!p) return raw;
    return `${String(p.mo).padStart(2, "0")}/${String(p.d).padStart(2, "0")}`;
  }

  if (mode === "week") {
    const wm = /^\d{4}-W(\d{2})$/.exec(raw);
    if (!wm) return raw;
    return `W${wm[1]}`;
  }

  const mm = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!mm) return raw;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIdx = Number(mm[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return raw;
  return `${monthNames[monthIdx]} ${mm[1]}`;
}

function formatXDetailLabel(value: string, mode: PremiumTrendMode) {
  const raw = String(value || "").trim();
  if (!raw) return raw;

  if (mode === "day") {
    const p = parseIsoDate(raw);
    if (!p) return raw;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${monthNames[p.mo - 1]} ${String(p.d).padStart(2, "0")}, ${p.y}`;
  }

  if (mode === "week") {
    return raw.replace(/^(\d{4})-W(\d{2})$/, "Week $2, $1");
  }

  return formatXLabel(raw, mode);
}

function buildLabelIndexes(total: number, maxLabels: number) {
  if (total <= 0) return [];
  if (total <= maxLabels) return Array.from({ length: total }, (_, i) => i);

  const target = Math.max(2, maxLabels);
  const step = (total - 1) / (target - 1);
  const idxs = new Set<number>();
  for (let i = 0; i < target; i++) idxs.add(Math.round(i * step));
  idxs.add(0);
  idxs.add(total - 1);
  return Array.from(idxs).sort((a, b) => a - b);
}

export default function PremiumTrendChart({
  title,
  subtitle,
  points,
  comparePoints = [],
  mode = "day",
  onModeChange,
  showModeSwitch = true,
  valueFormatter = fmtCompact,
  footerHint = "Hover un punto para ver detalle.",
  emptyLabel = "No trend data.",
  onHoverPoint,
}: Props) {
  const gradId = useId().replace(/:/g, "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showCompare, setShowCompare] = useState(true);

  const canCompare = comparePoints.length > 0;

  const rows = useMemo(() => {
    const currMap = new Map(points.map((p) => [p.key, p]));
    const compMap = new Map(comparePoints.map((p) => [p.key, p]));
    const keys = Array.from(new Set([...currMap.keys(), ...compMap.keys()])).sort((a, b) =>
      a.localeCompare(b),
    );
    return keys.map((key) => {
      const curr = currMap.get(key);
      const prev = compMap.get(key);
      return {
        key,
        label: curr?.label || prev?.label || key,
        value: Number(curr?.value || 0),
        compareValue: prev ? Number(prev.value || 0) : null,
      };
    });
  }, [points, comparePoints]);

  const chart = useMemo(() => {
    const w = 980;
    const h = 280;
    const padL = 56;
    const padR = 18;
    const padT = 16;
    const padB = 40;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const allValues = rows.flatMap((r) =>
      r.compareValue === null ? [r.value] : [r.value, r.compareValue],
    );
    const maxY = Math.max(...allValues, 1);

    const xFor = (i: number) =>
      padL + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * plotW);
    const yFor = (v: number) => h - padB - (v / maxY) * plotH;

    const pathFor = (values: Array<number | null>) => {
      let d = "";
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v === null) continue;
        const x = xFor(i);
        const y = yFor(v);
        d += d ? ` L ${x} ${y}` : `M ${x} ${y}`;
      }
      return d;
    };

    const current = rows.map((r) => r.value);
    const compare = rows.map((r) => r.compareValue);
    const currentPath = pathFor(current);
    const comparePath = pathFor(compare);

    const areaPath = rows.length
      ? `${currentPath} L ${xFor(rows.length - 1)} ${yFor(0)} L ${xFor(0)} ${yFor(0)} Z`
      : "";

    const ticks = [0, Math.round(maxY * 0.33), Math.round(maxY * 0.66), maxY];
    const maxLabels = mode === "day" ? 7 : 6;
    const labelIdxs = buildLabelIndexes(rows.length, maxLabels);

    return {
      w,
      h,
      padL,
      padR,
      current,
      compare,
      xFor,
      yFor,
      ticks,
      currentPath,
      comparePath,
      areaPath,
      labelIdxs,
    };
  }, [rows, mode]);

  const stats = useMemo(() => {
    const currentTotal = rows.reduce((acc, r) => acc + r.value, 0);
    const currentMax = Math.max(...rows.map((r) => r.value), 0);
    const compareTotal = rows.reduce((acc, r) => acc + Number(r.compareValue || 0), 0);
    const compareDeltaPct = canCompare ? pctDelta(currentTotal, compareTotal) : null;
    return { currentTotal, currentMax, compareTotal, compareDeltaPct };
  }, [rows, canCompare]);

  if (!rows.length) {
    return (
      <div className="mapCard premiumTrendCard premiumTrendCardEmpty">
        <div className="mini">{emptyLabel}</div>
      </div>
    );
  }

  const hover = hoverIndex === null ? null : rows[hoverIndex];
  const hoverDelta = hover && hover.compareValue !== null ? hover.value - hover.compareValue : null;
  const hoverDeltaPct =
    hover && hover.compareValue !== null ? pctDelta(hover.value, hover.compareValue) : null;

  return (
    <div className="mapCard premiumTrendCard">
      <div className="mapCardTop premiumTrendTop">
        <div className="premiumTrendHead">
          <div className="mapCardTitle premiumTrendTitle">{title}</div>
          {subtitle ? (
            <div className="mini premiumTrendSubtitle">
              {subtitle}
            </div>
          ) : null}
        </div>

        <div className="premiumTrendActions">
          {showModeSwitch ? (
            <div className="segmented" role="tablist" aria-label={`${title} mode`}>
              {(["day", "week", "month"] as PremiumTrendMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`segBtn ${mode === m ? "segBtnOn" : ""}`}
                  onClick={() => onModeChange?.(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          ) : null}

          {canCompare ? (
            <button
              type="button"
              className={`smallBtn premiumTrendCompareBtn ${showCompare ? "smallBtnOn" : ""}`}
              onClick={() => setShowCompare((v) => !v)}
            >
              Compare
            </button>
          ) : null}
        </div>
      </div>

      <div className="mapFrame premiumTrendFrame">
        <svg
          viewBox={`0 0 ${chart.w} ${chart.h}`}
          width="100%"
          height={chart.h}
          className="premiumTrendSvg"
        >
          <defs>
            <linearGradient id={`${gradId}_line`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="rgba(96,165,250,0.95)" />
              <stop offset="100%" stopColor="rgba(52,211,153,0.95)" />
            </linearGradient>
            <linearGradient id={`${gradId}_area`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(96,165,250,0.28)" />
              <stop offset="100%" stopColor="rgba(96,165,250,0.03)" />
            </linearGradient>
          </defs>

          {chart.ticks.map((t, idx) => {
            const y = chart.yFor(t);
            return (
              <g key={idx}>
                <line
                  x1={chart.padL}
                  y1={y}
                  x2={chart.w - chart.padR}
                  y2={y}
                  className="premiumTrendGridLine"
                />
                <text
                  x={chart.padL - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="premiumTrendAxisYLabel"
                >
                  {valueFormatter(t)}
                </text>
              </g>
            );
          })}

          {chart.areaPath ? <path d={chart.areaPath} fill={`url(#${gradId}_area)`} /> : null}
          {chart.currentPath ? (
            <path
              d={chart.currentPath}
              fill="none"
              stroke={`url(#${gradId}_line)`}
              strokeWidth="3"
              strokeLinecap="round"
            />
          ) : null}
          {showCompare && canCompare && chart.comparePath ? (
            <path
              d={chart.comparePath}
              fill="none"
              stroke="rgba(148,163,184,0.88)"
              strokeWidth="2"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
          ) : null}

          {rows.map((r, i) => {
            const cx = chart.xFor(i);
            const cy = chart.yFor(r.value);
            const compareCy = r.compareValue === null ? null : chart.yFor(r.compareValue);
            return (
              <g key={r.key}>
                {showCompare && canCompare && compareCy !== null ? (
                  <circle cx={cx} cy={compareCy} r={3} fill="rgba(148,163,184,0.85)" />
                ) : null}
                <circle cx={cx} cy={cy} r={4} fill="rgba(96,165,250,0.95)" />
                <rect
                  x={cx - Math.max(20, (chart.w - chart.padL - chart.padR) / Math.max(rows.length, 1) / 2)}
                  y={0}
                  width={Math.max(40, (chart.w - chart.padL - chart.padR) / Math.max(rows.length, 1))}
                  height={chart.h}
                  fill="transparent"
                  onMouseEnter={() => {
                    setHoverIndex(i);
                    onHoverPoint?.({
                      key: r.key,
                      label: r.label,
                      value: r.value,
                      compareValue: r.compareValue,
                      delta: r.compareValue === null ? null : r.value - r.compareValue,
                      deltaPct: r.compareValue === null ? null : pctDelta(r.value, r.compareValue),
                    });
                  }}
                  onMouseLeave={() => {
                    setHoverIndex(null);
                    onHoverPoint?.(null);
                  }}
                />
              </g>
            );
          })}

          {chart.labelIdxs.map((i) => {
            const x = chart.xFor(i);
            return (
              <text
                key={`lbl_${rows[i].key}`}
                x={x}
                y={chart.h - 12}
                textAnchor="middle"
                className="premiumTrendAxisXLabel"
              >
                {formatXLabel(rows[i].label, mode)}
              </text>
            );
          })}
        </svg>

        <div className="mini premiumTrendHoverText">
          {hover ? (
            <>
              <b>{formatXDetailLabel(hover.label, mode)}</b>: {valueFormatter(hover.value)}
              {showCompare && hover.compareValue !== null ? (
                <>
                  {" "}
                  vs prev {valueFormatter(hover.compareValue)} (
                  {hoverDelta === null ? "—" : hoverDelta > 0 ? "+" : ""}
                  {hoverDelta === null ? "—" : valueFormatter(hoverDelta)}
                  {" / "}
                  {hoverDeltaPct === null
                    ? "—"
                    : `${hoverDeltaPct > 0 ? "+" : ""}${hoverDeltaPct.toFixed(1)}%`}
                  )
                </>
              ) : null}
            </>
          ) : (
            footerHint
          )}
        </div>

        <div className="premiumTrendMetaPills">
          <span className="pill chartPill">
            <span className="mini" style={{ opacity: 0.8 }}>
              Max / point
            </span>
            <b>{valueFormatter(stats.currentMax)}</b>
          </span>
          <span className="pill chartPill">
            <span className="mini" style={{ opacity: 0.8 }}>
              Total
            </span>
            <b>{valueFormatter(stats.currentTotal)}</b>
          </span>
          {canCompare ? (
            <span className="pill chartPill">
              <span className="mini" style={{ opacity: 0.8 }}>
                Vs prev
              </span>
              <b>
                {stats.compareDeltaPct === null
                  ? "—"
                  : `${stats.compareDeltaPct > 0 ? "+" : ""}${stats.compareDeltaPct.toFixed(1)}%`}
              </b>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
