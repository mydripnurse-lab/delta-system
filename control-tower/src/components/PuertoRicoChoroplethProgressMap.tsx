// src/components/PuertoRicoChoroplethProgressMap.tsx
"use client";

import { memo, useMemo, useState } from "react";

type SheetStateRow = {
  state: string;
  counties: { total: number; ready: number; domainsActive?: number };
  cities: { total: number; ready: number; domainsActive?: number };
};

export type MapMetric = "ready" | "domains";

type Props = {
  rows: SheetStateRow[];
  metric: MapMetric;
  selected: string;
  onPick: (name: string) => void;
};

// helpers
function s(v: any) {
  return String(v ?? "").trim();
}

// Si aún no tienes data por municipio, esto vuelve null y el mapa se pinta “neutral”.
function getMunicipioMetricValue(
  _municipioName: string,
  _rows: SheetStateRow[],
  _metric: MapMetric,
) {
  // TODO: cuando tengas data por municipio, calcula aquí:
  // Ejemplo esperado:
  // - rows podría venir con structure municipal (no ahora)
  // - o consumir /api/sheet/pr?metric=ready que devuelva { municipio: pct }
  return null as null | number;
}

function colorFor(v: number | null) {
  // Paleta simple (sin hardcodear “bonito” pero usable)
  // v: 0..1
  if (v === null) return "rgba(255,255,255,0.06)";
  const x = Math.max(0, Math.min(1, v));
  // verde más intenso con progreso
  return `rgba(80, 255, 180, ${0.18 + 0.62 * x})`;
}

function strokeForSelected(isSelected: boolean) {
  return isSelected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.10)";
}

function PuertoRicoChoroplethProgressMapImpl({
  rows,
  metric,
  selected,
  onPick,
}: Props) {
  const [hoverName, setHoverName] = useState("");
  const hasPuertoRico = useMemo(
    () => rows.some((row) => s(row.state).toLowerCase() === "puerto-rico" || s(row.state).toLowerCase() === "puerto rico"),
    [rows],
  );

  // memoize lookup (aunque hoy no devuelve data real)
  const valueLookup = useMemo(() => {
    const m = new Map<string, number | null>();
    // Si no tienes data por municipio, quedará todo null.
    // A futuro: aquí podrías precalcular en base a un dataset municipal.
    return m;
  }, [rows, metric]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <div className="mapTopOverlay">
        <div className="mapHintChip">
          {hoverName ? hoverName : "Puerto Rico (fallback map)"}
        </div>
      </div>

      <button
        type="button"
        onMouseEnter={() => setHoverName("Puerto Rico")}
        onMouseLeave={() => setHoverName("")}
        onClick={() => onPick("Puerto Rico")}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 220,
          borderRadius: 14,
          border: `1px solid ${strokeForSelected(selected === "Puerto Rico")}`,
          background: colorFor(hasPuertoRico ? valueLookup.get("Puerto Rico") ?? getMunicipioMetricValue("Puerto Rico", rows, metric) : null),
          color: "rgba(255,255,255,0.9)",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Puerto Rico
      </button>
    </div>
  );
}

export default memo(PuertoRicoChoroplethProgressMapImpl);
