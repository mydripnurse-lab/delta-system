import type { DashboardRangePreset } from "@/lib/dateRangePresets";

const PRESETS: readonly DashboardRangePreset[] = [
  "today",
  "24h",
  "1d",
  "7d",
  "28d",
  "1m",
  "3m",
  "6m",
  "1y",
  "custom",
];

function s(v: unknown) {
  return String(v ?? "").trim();
}

function firstDatePart(v: string) {
  const x = s(v);
  if (!x) return "";
  const m = x.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

export function isDashboardRangePreset(v: string): v is DashboardRangePreset {
  return PRESETS.includes(v as DashboardRangePreset);
}

export function readDashboardRangeFromSearch(
  searchParams: { get(name: string): string | null } | null | undefined,
  fallbackPreset: DashboardRangePreset,
) {
  const presetRaw = s(searchParams?.get("preset"));
  const queryStart = s(searchParams?.get("customStart")) || firstDatePart(s(searchParams?.get("start")));
  const queryEnd = s(searchParams?.get("customEnd")) || firstDatePart(s(searchParams?.get("end")));

  const preset = isDashboardRangePreset(presetRaw)
    ? presetRaw
    : queryStart && queryEnd
      ? "custom"
      : fallbackPreset;

  const customStart = preset === "custom" ? queryStart : "";
  const customEnd = preset === "custom" ? queryEnd : "";

  return { preset, customStart, customEnd };
}

export function addDashboardRangeParams(
  qs: URLSearchParams,
  preset: DashboardRangePreset,
  customStart: string,
  customEnd: string,
) {
  qs.set("preset", preset);
  if (preset === "custom" && customStart && customEnd) {
    qs.set("customStart", customStart);
    qs.set("customEnd", customEnd);
  }
}

export function appendDashboardRangeToHref(
  baseHref: string,
  preset: DashboardRangePreset,
  customStart: string,
  customEnd: string,
) {
  const [basePath, hash = ""] = baseHref.split("#");
  const qs = new URLSearchParams();
  addDashboardRangeParams(qs, preset, customStart, customEnd);
  const joiner = basePath.includes("?") ? "&" : "?";
  const href = `${basePath}${joiner}${qs.toString()}`;
  return hash ? `${href}#${hash}` : href;
}
