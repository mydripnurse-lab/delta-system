"use client";

import { useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import usCounties from "us-atlas/counties-10m.json";

type Metric = "ready" | "domains";

type CityRow = {
  [key: string]: any;
};

type Props = {
  rows: CityRow[];
  metric: Metric;
  onPickMunicipio?: (name: string) => void;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function isTrue(v: any) {
  const t = s(v).toLowerCase();
  return t === "true" || t === "1" || t === "yes" || t === "y";
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function alphaFromNormalized(n01: number) {
  return 0.08 + clamp01(n01) * 0.72;
}

function normalizeName(name: string) {
  return s(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FIPS_TO_MUNICIPIO: Record<string, string> = {
  "72001": "Adjuntas",
  "72003": "Aguada",
  "72005": "Aguadilla",
  "72007": "Aguas Buenas",
  "72009": "Aibonito",
  "72011": "Añasco",
  "72013": "Arecibo",
  "72015": "Arroyo",
  "72017": "Barceloneta",
  "72019": "Barranquitas",
  "72021": "Bayamón",
  "72023": "Cabo Rojo",
  "72025": "Caguas",
  "72027": "Camuy",
  "72029": "Canóvanas",
  "72031": "Carolina",
  "72033": "Cataño",
  "72035": "Cayey",
  "72037": "Ceiba",
  "72039": "Ciales",
  "72041": "Cidra",
  "72043": "Coamo",
  "72045": "Comerío",
  "72047": "Corozal",
  "72049": "Culebra",
  "72051": "Dorado",
  "72053": "Fajardo",
  "72054": "Florida",
  "72055": "Guánica",
  "72057": "Guayama",
  "72059": "Guayanilla",
  "72061": "Guaynabo",
  "72063": "Gurabo",
  "72065": "Hatillo",
  "72067": "Hormigueros",
  "72069": "Humacao",
  "72071": "Isabela",
  "72073": "Jayuya",
  "72075": "Juana Díaz",
  "72077": "Juncos",
  "72079": "Lajas",
  "72081": "Lares",
  "72083": "Las Marías",
  "72085": "Las Piedras",
  "72087": "Loíza",
  "72089": "Luquillo",
  "72091": "Manatí",
  "72093": "Maricao",
  "72095": "Maunabo",
  "72097": "Mayagüez",
  "72099": "Moca",
  "72101": "Morovis",
  "72103": "Naguabo",
  "72105": "Naranjito",
  "72107": "Orocovis",
  "72109": "Patillas",
  "72111": "Peñuelas",
  "72113": "Ponce",
  "72115": "Quebradillas",
  "72117": "Rincón",
  "72119": "Río Grande",
  "72121": "Sabana Grande",
  "72123": "Salinas",
  "72125": "San Germán",
  "72127": "San Juan",
  "72129": "San Lorenzo",
  "72131": "San Sebastián",
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

export default function PuertoRicoMunicipioProgressMap({
  rows,
  metric,
  onPickMunicipio,
}: Props) {
  const [hover, setHover] = useState("");
  const [selectedFips, setSelectedFips] = useState("");

  const byMunicipio = useMemo(() => {
    const m = new Map<string, { total: number; readyDone: number; domainsDone: number }>();
    for (const r of rows || []) {
      const city = s(r["City"]);
      if (!city) continue;
      const key = normalizeName(city);
      const cur = m.get(key) || { total: 0, readyDone: 0, domainsDone: 0 };
      const eligible = !!r.__eligible;
      const domainCreated = isTrue(r["Domain Created"]);
      cur.total += 1;
      if (eligible) cur.readyDone += 1;
      if (eligible && domainCreated) cur.domainsDone += 1;
      m.set(key, cur);
    }
    return m;
  }, [rows]);

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

  const valueByFips = useMemo(() => {
    const m = new Map<string, number>();
    for (const [fips, municipio] of Object.entries(FIPS_TO_MUNICIPIO)) {
      const row = byMunicipio.get(normalizeName(municipio));
      if (!row || row.total <= 0) {
        m.set(fips, 0);
        continue;
      }
      const ratio =
        metric === "ready" ? row.readyDone / row.total : row.domainsDone / row.total;
      m.set(fips, clamp01(ratio));
    }
    return m;
  }, [byMunicipio, metric]);

  return (
    <div className="choroplethWrap">
      <div className="choroplethTop">
        <div>
          <div className="choroplethTitle">Puerto Rico Map</div>
          <div className="mini" style={{ opacity: 0.85 }}>
            {metric === "ready"
              ? "Subaccount Created por pueblo"
              : "Domain Created por pueblo"}
          </div>
        </div>
        <div className="choroplethHover mini">
          <b>{hover || "Hover un pueblo"}</b>
        </div>
      </div>

      <div className="choroplethSvgWrap">
        <svg
          className="choroplethSvg"
          viewBox="0 0 1040 620"
          role="img"
          aria-label="Puerto Rico choropleth map by municipio"
        >
          <g>
            {geo.prCounties.map((f: any) => {
              const fips = String(f.id).padStart(5, "0");
              const municipio = FIPS_TO_MUNICIPIO[fips] || fips;
              const pct = valueByFips.get(fips) || 0;
              const isSel = selectedFips === fips;
              return (
                <path
                  key={fips}
                  d={geo.path(f) || ""}
                  className={`stateShape ${isSel ? "stateShapeSel" : ""}`}
                  style={{ ["--fillA" as any]: String(alphaFromNormalized(pct)) } as any}
                  onMouseEnter={() => setHover(`${municipio} · ${Math.round(pct * 100)}%`)}
                  onMouseLeave={() => setHover("")}
                  onClick={() => {
                    setSelectedFips(fips);
                    onPickMunicipio?.(municipio);
                  }}
                />
              );
            })}
          </g>

          <g>
            {geo.prCounties.map((f: any) => {
              const fips = String(f.id).padStart(5, "0");
              const area = geo.areas.get(fips) || 0;
              if (area < 1700) return null;
              const c = geo.centroids.get(fips);
              if (!c) return null;
              const pct = valueByFips.get(fips) || 0;
              return (
                <text
                  key={`lbl-${fips}`}
                  x={c[0]}
                  y={c[1]}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="stateLabel"
                >
                  {Math.round(pct * 100)}%
                </text>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
