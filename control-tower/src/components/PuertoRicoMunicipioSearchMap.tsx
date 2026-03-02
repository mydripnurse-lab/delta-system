"use client";

import { useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import usCounties from "us-atlas/counties-10m.json";

type Row = {
  municipio: string;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  position?: number;
  pagesCounted?: number;
};

type Props = {
  rows: Row[];
  metric: "impressions" | "clicks";
  selectedMunicipio?: string;
  onPick?: (municipio: string) => void;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function normalizeName(v: string) {
  return s(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function alphaFromNormalized(n01: number) {
  return 0.08 + clamp01(n01) * 0.72;
}

const FIPS_TO_MUNICIPIO: Record<string, string> = {
  "72001": "Adjuntas",
  "72003": "Aguada",
  "72005": "Aguadilla",
  "72007": "Aguas Buenas",
  "72009": "Aibonito",
  "72011": "Anasco",
  "72013": "Arecibo",
  "72015": "Arroyo",
  "72017": "Barceloneta",
  "72019": "Barranquitas",
  "72021": "Bayamon",
  "72023": "Cabo Rojo",
  "72025": "Caguas",
  "72027": "Camuy",
  "72029": "Canovanas",
  "72031": "Carolina",
  "72033": "Catano",
  "72035": "Cayey",
  "72037": "Ceiba",
  "72039": "Ciales",
  "72041": "Cidra",
  "72043": "Coamo",
  "72045": "Comerio",
  "72047": "Corozal",
  "72049": "Culebra",
  "72051": "Dorado",
  "72053": "Fajardo",
  "72054": "Florida",
  "72055": "Guanica",
  "72057": "Guayama",
  "72059": "Guayanilla",
  "72061": "Guaynabo",
  "72063": "Gurabo",
  "72065": "Hatillo",
  "72067": "Hormigueros",
  "72069": "Humacao",
  "72071": "Isabela",
  "72073": "Jayuya",
  "72075": "Juana Diaz",
  "72077": "Juncos",
  "72079": "Lajas",
  "72081": "Lares",
  "72083": "Las Marias",
  "72085": "Las Piedras",
  "72087": "Loiza",
  "72089": "Luquillo",
  "72091": "Manati",
  "72093": "Maricao",
  "72095": "Maunabo",
  "72097": "Mayaguez",
  "72099": "Moca",
  "72101": "Morovis",
  "72103": "Naguabo",
  "72105": "Naranjito",
  "72107": "Orocovis",
  "72109": "Patillas",
  "72111": "Penuelas",
  "72113": "Ponce",
  "72115": "Quebradillas",
  "72117": "Rincon",
  "72119": "Rio Grande",
  "72121": "Sabana Grande",
  "72123": "Salinas",
  "72125": "San German",
  "72127": "San Juan",
  "72129": "San Lorenzo",
  "72131": "San Sebastian",
  "72133": "Santa Isabel",
  "72135": "Toa Alta",
  "72137": "Toa Baja",
  "72139": "Trujillo Alto",
  "72141": "Utuado",
  "72143": "Vega Alta",
  "72145": "Vega Baja",
  "72147": "Vieques",
  "72149": "Villalba",
  "72151": "Yabucoa",
  "72153": "Yauco",
};

export default function PuertoRicoMunicipioSearchMap({
  rows,
  metric,
  selectedMunicipio,
  onPick,
}: Props) {
  const [hover, setHover] = useState("");
  const selectedKey = normalizeName(selectedMunicipio || "");

  const byMunicipio = useMemo(() => {
    const m = new Map<string, { municipio: string; impressions: number; clicks: number }>();
    for (const r of rows || []) {
      const municipio = s(r.municipio);
      if (!municipio) continue;
      const key = normalizeName(municipio);
      if (!key) continue;
      const prev = m.get(key) || { municipio, impressions: 0, clicks: 0 };
      prev.impressions += n(r.impressions);
      prev.clicks += n(r.clicks);
      m.set(key, prev);
    }
    return m;
  }, [rows]);

  const maxValue = useMemo(() => {
    let max = 0;
    for (const x of byMunicipio.values()) {
      const v = metric === "impressions" ? x.impressions : x.clicks;
      if (v > max) max = v;
    }
    return Math.max(max, 1);
  }, [byMunicipio, metric]);

  const geo = useMemo(() => {
    const allCounties = feature(
      usCounties as any,
      (usCounties as any).objects.counties,
    ).features as any[];

    const prCounties = allCounties.filter((f: any) => {
      const id = String(f.id).padStart(5, "0");
      return id.startsWith("72");
    });

    const projection = geoMercator();
    projection.fitExtent(
      [
        [28, 26],
        [1012, 594],
      ],
      {
        type: "FeatureCollection",
        features: prCounties,
      } as any,
    );

    const path = geoPath(projection);
    const centroids = new Map<string, [number, number]>();
    const areas = new Map<string, number>();

    for (const f of prCounties) {
      const id = String(f.id).padStart(5, "0");
      const c = path.centroid(f) as any;
      if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        centroids.set(id, [c[0], c[1]]);
      }
      areas.set(id, Number(path.area(f) || 0));
    }

    return { prCounties, path, centroids, areas };
  }, []);

  return (
    <div className="choroplethWrap">
      <div className="choroplethTop">
        <div>
          <div className="choroplethTitle">Puerto Rico</div>
          <div className="mini" style={{ opacity: 0.85 }}>
            {metric === "impressions" ? "Impressions por pueblo" : "Clicks por pueblo"}
          </div>
        </div>
        <div className="choroplethHover mini">
          <b>{hover || "Hover a municipio"}</b>
        </div>
      </div>

      <div className="choroplethSvgWrap">
        <svg
          className="choroplethSvg"
          viewBox="0 0 1040 620"
          role="img"
          aria-label="Puerto Rico municipios choropleth map"
        >
          <g>
            {geo.prCounties.map((f: any) => {
              const fips = String(f.id).padStart(5, "0");
              const municipio = FIPS_TO_MUNICIPIO[fips] || fips;
              const row = byMunicipio.get(normalizeName(municipio));
              const value = row ? (metric === "impressions" ? row.impressions : row.clicks) : 0;
              const isSel = selectedKey && selectedKey === normalizeName(municipio);
              const a = alphaFromNormalized(value / maxValue);

              return (
                <path
                  key={fips}
                  d={geo.path(f) || ""}
                  className={`stateShape ${isSel ? "stateShapeSel" : ""}`}
                  style={{ ["--fillA" as any]: String(a) } as any}
                  onMouseEnter={() =>
                    setHover(`${municipio} · ${Math.round(value).toLocaleString()}`)
                  }
                  onMouseLeave={() => setHover("")}
                  onClick={() => onPick?.(municipio)}
                />
              );
            })}
          </g>

          <g>
            {geo.prCounties.map((f: any) => {
              const fips = String(f.id).padStart(5, "0");
              const area = geo.areas.get(fips) || 0;
              if (area < 1650) return null;
              const c = geo.centroids.get(fips);
              if (!c) return null;

              const municipio = FIPS_TO_MUNICIPIO[fips] || fips;
              const row = byMunicipio.get(normalizeName(municipio));
              const value = row ? (metric === "impressions" ? row.impressions : row.clicks) : 0;

              return (
                <text
                  key={`lbl-${fips}`}
                  x={c[0]}
                  y={c[1]}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="stateLabel"
                >
                  {Math.round(value).toLocaleString()}
                </text>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
