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
const DASHBOARD_RANGE_STORAGE_KEY = "dashboard_range_sync_v1";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function firstDatePart(v: string) {
  const x = s(v);
  if (!x) return "";
  const m = x.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function readStoredDashboardRange() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_RANGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      preset?: string;
      customStart?: string;
      customEnd?: string;
    };
    const presetRaw = s(parsed?.preset);
    if (!isDashboardRangePreset(presetRaw)) return null;
    const customStart = firstDatePart(s(parsed?.customStart));
    const customEnd = firstDatePart(s(parsed?.customEnd));
    if (presetRaw === "custom" && (!customStart || !customEnd)) return null;
    return {
      preset: presetRaw,
      customStart: presetRaw === "custom" ? customStart : "",
      customEnd: presetRaw === "custom" ? customEnd : "",
    };
  } catch {
    return null;
  }
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

  const queryPreset = isDashboardRangePreset(presetRaw)
    ? presetRaw
    : queryStart && queryEnd
      ? "custom"
      : "";
  const stored = queryPreset ? null : readStoredDashboardRange();
  const preset = queryPreset || stored?.preset || fallbackPreset;
  const customStart =
    preset === "custom"
      ? queryPreset
        ? queryStart
        : stored?.customStart || ""
      : "";
  const customEnd =
    preset === "custom"
      ? queryPreset
        ? queryEnd
        : stored?.customEnd || ""
      : "";

  return { preset, customStart, customEnd };
}

export function persistDashboardRange(
  preset: DashboardRangePreset,
  customStart: string,
  customEnd: string,
) {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      preset,
      customStart: preset === "custom" ? firstDatePart(customStart) : "",
      customEnd: preset === "custom" ? firstDatePart(customEnd) : "",
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(DASHBOARD_RANGE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
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
